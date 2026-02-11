import esriRequest from 'esri/request'
import Portal from 'esri/portal/Portal'
import { JimuMapView } from 'jimu-arcgis'
import { Workspace, MapSessionState, WorkspacePayload, LayerConfig, BasemapLayerInfo, BasemapSnapshot } from './models'
import { SessionManager, getAppStore } from 'jimu-core'
import Basemap from 'esri/Basemap'
import Layer from 'esri/layers/Layer'
import Map from 'esri/Map'
import FeatureLayer from 'esri/layers/FeatureLayer'
import MapImageLayer from 'esri/layers/MapImageLayer'
import TileLayer from 'esri/layers/TileLayer'
import VectorTileLayer from 'esri/layers/VectorTileLayer'
import WebTileLayer from 'esri/layers/WebTileLayer'
import Extent from 'esri/geometry/Extent'


const portalTags = 'ExB-session,workspace,map-config'
const portalItemType = 'Application Configuration'

/**
 * Retrieves the portal URL and a valid token for REST calls.
 * @returns An object containing the portal URL and token.
 */
const getPortalSession = () => {
  const session = SessionManager.getInstance().getMainSession()
  const portalUrl = getAppStore().getState().portalUrl
  return { portalUrl, token: session.token }
}

/**
 * Ensures the portal is loaded and the user is authenticated.
 * @param portal The portal instance to check.
 */
const ensurePortalUser = async (portal: Portal): Promise<void> => {
  portal.authMode = 'immediate'
  await portal.load()
  if (!portal.user) throw new Error('User not authenticated')
}


// -----------------------------------------------------------------------------
// BASEMAP
// -----------------------------------------------------------------------------

/**
 * Serializes a basemap layer into a plain object that can be saved in the session payload.
 * @param layer The basemap layer to serialize.
 * @returns A plain object representing the basemap layer, or null if serialization fails.
 */
const serializeBasemapLayer = (layer: Layer): BasemapLayerInfo | null => {
  try {
    const info: BasemapLayerInfo = {
      url: (layer as any).url || '',
      type: layer.type,
      title: layer.title,
      opacity: layer.opacity,
      visible: layer.visible
    }
    // For vector tile layers, also capture the style URL if available, as it may be needed to restore the layer correctly
    if (layer.type === 'vector-tile' && (layer as any).url) {
      info.styleUrl = (layer as any).currentStyleInfo?.styleUrl || (layer as any).url
    }
    return info.url ? info : null
  } catch {
    return null
  }
}

/**
 * Deserializes a basemap layer from a plain object.
 * @param info The basemap layer info to deserialize.
 * @returns A new Esri layer instance or null if deserialization fails.
 */
const deserializeBasemapLayer = (info: BasemapLayerInfo): Layer | null => {
  try {
    const opts: any = {
      url: info.url,
      title: info.title,
      opacity: info.opacity ?? 1,
      visible: info.visible ?? true
    }
    switch (info.type) {
      case 'tile':
        return new TileLayer(opts)
      case 'vector-tile':
        return new VectorTileLayer({ ...opts, url: info.styleUrl || info.url })
      // case 'web-tile':
      //   return new WebTileLayer(opts)
      case 'map-image':
        return new MapImageLayer(opts)
      default:
        return new TileLayer(opts)
    }
  } catch (e) {
    console.warn('Could not deserialize basemap layer', info, e)
    return null
  }
}

/**
 * Creates a snapshot of the basemap, capturing its layers and properties.
 * @param basemap The basemap to snapshot.
 * @returns A snapshot of the basemap.
 */
const snapshotBasemap = (basemap: Basemap): BasemapSnapshot => {
  const baseLayers: BasemapLayerInfo[] = []
  const referenceLayers: BasemapLayerInfo[] = []

  basemap.baseLayers?.forEach(layer => {
    const info = serializeBasemapLayer(layer)
    if (info) baseLayers.push(info)
  })

  basemap.referenceLayers?.forEach(layer => {
    const info = serializeBasemapLayer(layer)
    if (info) referenceLayers.push(info)
  })

  return {
    id: basemap.id || '',
    title: basemap.title || '',
    baseLayers,
    referenceLayers
  }
}

/**
 * Restores a basemap from a snapshot, attempting to recreate the original basemap.
 * @param snapshot The basemap snapshot to restore.
 * @returns A new Basemap instance or null if restoration fails.
 */
const restoreBasemapFromSnapshot = (snapshot: BasemapSnapshot): Basemap | null => {
  if (snapshot.baseLayers.length > 0) {
    const baseLayers = snapshot.baseLayers
      .map(deserializeBasemapLayer)
      .filter(Boolean) as Layer[]

    const referenceLayers = snapshot.referenceLayers
      .map(deserializeBasemapLayer)
      .filter(Boolean) as Layer[]

    if (baseLayers.length > 0) {
      return new Basemap({
        baseLayers,
        referenceLayers,
        title: snapshot.title
      })
    }
  }

  // As a fallback, if the snapshot includes an ID, try to restore using the well-known basemap ID
  if (snapshot.id) {
    try {
      const wellKnown = Basemap.fromId(snapshot.id)
      if (wellKnown) return wellKnown
    } catch { /* ignore */ }
  }

  return null
}


// -----------------------------------------------------------------------------
//  CREATE SESSION PAYLOAD 
// -----------------------------------------------------------------------------

/**
 * Builds the payload to be saved for a workspace session, 
 * capturing the current map state including basemap, layers, and extent.
 * @param data The workspace data to include in the payload.
 * @param jimuMapView The JimuMapView instance.
 * @returns An object containing the payload and the title for the workspace session.
 */
const buildPayload = async (
  data: Workspace,
  jimuMapView: JimuMapView
): Promise<{ payload: WorkspacePayload; title: string }> => {
  const view = jimuMapView.view
  const map = view.map

  const layerConfigs = await extractLayerConfigs(map.layers.toArray())

  const sessionState: MapSessionState = {
    basemapId: map.basemap?.id || undefined,
    basemapSnapshot: map.basemap ? snapshotBasemap(map.basemap) : undefined,
    extent: view.extent?.toJSON(),
    zoom: view.zoom,
    layers: layerConfigs
  }

  const title = data.label

  const payload: WorkspacePayload = {
    valid: true,
    created: new Date().toISOString(),
    mapSession: sessionState,
    data: { ...data, label: title }
  }

  return { payload, title }
}

// -------------------------------------------------------------------------------------
//  SAVE A SESSION
// -------------------------------------------------------------------------------------

/**
 * Saves a workspace session, creating a new item in the portal.
 * @param portal The portal instance.
 * @param data The workspace data to save.
 * @param jimuMapView The JimuMapView instance.
 * @param tags Optional tags to associate with the saved session.
 * @returns A promise that resolves to the saved workspace.
 */
export const saveMapSession = async (
  portal: Portal,
  data: Workspace,
  jimuMapView: JimuMapView,
  tags = portalTags
): Promise<Workspace> => {

  await ensurePortalUser(portal)
  if (!jimuMapView?.view) throw new Error('Map view is required to save session')

  const { portalUrl, token } = getPortalSession()
  const { payload, title } = await buildPayload(data, jimuMapView)

  const form = new FormData()
  form.append('f', 'json')
  form.append('title', title)
  form.append('type', portalItemType) 
  form.append('token', token)
  form.append('tags', tags)
  form.append('text', JSON.stringify(payload))

  // Use the "addItem" endpoint to create a new item in the user's content
  const response = await esriRequest(
    `${portalUrl}/sharing/rest/content/users/${portal.user.username}/addItem`,
    { authMode: 'auto', method: 'post', body: form }
  )

  if (!response?.data?.success) {
    throw new Error(response?.data?.error?.message || 'Failed to save workspace session')
  }

  // Return the saved workspace with the new ID assigned by the portal
  return { ...data, id: response.data.id }
}

// -------------------------------------------------------------------------------------
//  UPDATE A SESSION
// -------------------------------------------------------------------------------------

/**
 * Updates an existing workspace session, overwriting the current item in the portal.
 * @param portal The portal instance.
 * @param data The workspace data to update.
 * @param jimuMapView The JimuMapView instance.
 * @returns A promise that resolves to the updated workspace.
 */
export const updateMapSession = async (
  portal: Portal,
  data: Workspace,
  jimuMapView: JimuMapView,
): Promise<Workspace> => {

  await ensurePortalUser(portal)
  if (!jimuMapView?.view) throw new Error('Map view is required to save session')
  if (!data.id) throw new Error('Cannot update a session without an ID')

  const { portalUrl, token } = getPortalSession()
  const { payload, title } = await buildPayload(data, jimuMapView)
  payload.modified = new Date().toISOString()

  const form = new FormData()
  form.append('f', 'json')
  form.append('title', title)
  form.append('token', token)
  form.append('text', JSON.stringify(payload))

  // Use the "update" endpoint to overwrite the existing item in the user's content
  const response = await esriRequest(
    `${portalUrl}/sharing/rest/content/users/${portal.user.username}/items/${data.id}/update`,
    { authMode: 'auto', method: 'post', body: form }
  )

  if (!response?.data?.success) {
    throw new Error(response?.data?.error?.message || 'Failed to update workspace session')
  }

  return { ...data, label: title }
}

// -------------------------------------------------------------------------------------
//  LIST SESSIONS
// --------------------------------------------------------------------------------------

/**
 * Lists all workspace sessions for the current user filtered by tags.
 * @param portal The portal instance.
 * @param tags Optional tags to filter the sessions.
 * @returns A promise that resolves to an array of workspace sessions.
 */
export const listMapSessions = async (
  portal: Portal,
  tags = portalTags
): Promise<Workspace[]> => {

  await ensurePortalUser(portal)
  const { portalUrl, token } = getPortalSession()

  const tagQuery = tags.split(',').map(t => `tags:"${t.trim()}"`).join(' AND ')
  const searchQuery = `${tagQuery} AND type:"${portalItemType}" AND owner:${portal.user.username}`

  const form = new FormData()
  form.append('f', 'json')
  form.append('q', searchQuery)
  form.append('num', '100')
  form.append('sortField', 'modified')
  form.append('sortOrder', 'desc')
  form.append('token', token)

  // Use the "search" endpoint to find items in the user's content that match the query
  const response = await esriRequest(
    `${portalUrl}/sharing/rest/search`,
    { authMode: 'auto', method: 'post', body: form }
  )

  // Map the search results to the Workspace format expected by the application
  const results = response?.data?.results || []
  return results.map((item: any) => ({ id: item.id, label: item.title }))
}

// -------------------------------------------------------------------------------------
//  LOAD A SESSION
// -------------------------------------------------------------------------------------

/**
 * Loads a workspace session from the portal and restores the map view state.
 * @param portal The portal instance.
 * @param itemId The ID of the workspace session item to load.
 * @param jimuMapView The JimuMapView instance.
 * @returns A promise that resolves to the loaded workspace payload.
 */
export const loadMapSession = async (
  portal: Portal,
  itemId: string,
  jimuMapView: JimuMapView
): Promise<WorkspacePayload> => {

  await ensurePortalUser(portal)
  if (!jimuMapView?.view) throw new Error('Map view is required to load session')

  const { portalUrl, token } = getPortalSession()

  // Use the "data" endpoint to retrieve the item data
  const response = await esriRequest(
    `${portalUrl}/sharing/rest/content/items/${itemId}/data`,
    { authMode: 'auto', query: { f: 'json', token } }
  )

  const payload: WorkspacePayload = response?.data
  if (!payload?.valid) {
    throw new Error('Item is not a valid workspace session')
  }

  const { mapSession } = payload
  const view = jimuMapView.view
  const map = view.map

  // 1. Restore basemap
  let basemapRestored = false

  // First try to restore from the snapshot, which has more information and can handle custom basemaps
  if (mapSession.basemapSnapshot) {
    try {
      const restoredBasemap = restoreBasemapFromSnapshot(mapSession.basemapSnapshot)
      if (restoredBasemap) {
        await restoredBasemap.load()
        map.basemap = restoredBasemap   
        basemapRestored = true
      }
    } catch (e) {
      console.warn('Could not restore basemap from snapshot', e)
    }
  }

  // If snapshot restoration failed, try to restore from JSON
  if (!basemapRestored && (mapSession as any).basemapJSON) {
    try {
      const restoredBasemap = Basemap.fromJSON((mapSession as any).basemapJSON)
      await restoredBasemap.load()
      map.basemap = restoredBasemap   
      basemapRestored = true
    } catch {
      console.warn('Could not restore basemap from JSON, trying fromId…')
    }
  }

  // At last, try to restore using the well-known basemap ID (Esri basemaps)
  if (!basemapRestored && mapSession.basemapId) {
    try {
      const wellKnown = Basemap.fromId(mapSession.basemapId)
      if (wellKnown) {
        map.basemap = wellKnown
        basemapRestored = true
      }
    } catch {
      console.warn('Could not restore basemap', mapSession.basemapId)
    }
  }

  if (!basemapRestored) {
    console.warn('Basemap could not be restored by any strategy')
  }

  // 2. Restore extent / zoom
  if (mapSession.extent) {
    try {
      const extent = Extent.fromJSON(mapSession.extent)
      await view.goTo(extent, { animate: false })
    } catch {
      console.warn('Could not restore extent')
    }
  } else if (mapSession.zoom !== undefined) {
    await view.goTo({ zoom: mapSession.zoom }, { animate: false })
  }

  // 3. Restore layers
  if (Array.isArray(mapSession.layers)) {
    const savedLayerIds = new Set(mapSession.layers.map(cfg => cfg.id))
    const savedLayerUrls = new Set(mapSession.layers.filter(cfg => cfg.url).map(cfg => cfg.url))

    // Remove existing layers that are not in the saved session (by ID or URL)
    const layersToRemove: Layer[] = []
    map.layers.forEach(layer => {
      const matchById = savedLayerIds.has(layer.id)
      const matchByUrl = (layer as any).url && savedLayerUrls.has((layer as any).url)
      if (!matchById && !matchByUrl) {
        layersToRemove.push(layer)
      }
    })
    for (const layer of layersToRemove) {
      try { 
        map.remove(layer) 
      } catch (e) {
         console.warn('Could not remove layer', layer.id, e) 
      }
    }

    // Add or update layers from the saved session
    for (const cfg of mapSession.layers) {
      await restoreLayerConfig(map, cfg)
    }
  }

  return payload
}

// -------------------------------------------------------------------------------------
// DELETE A SESSION
// -------------------------------------------------------------------------------------

/**
 * Deletes a workspace session from the portal.
 * @param portal The portal instance.
 * @param itemId The ID of the workspace session item to delete.
 */
export const deleteMapSession = async (
  portal: Portal,
  itemId: string
): Promise<void> => {

  await ensurePortalUser(portal)

  const { portalUrl, token } = getPortalSession()

  const form = new FormData()
  form.append('f', 'json')
  form.append('token', token)

  // Use the "delete" endpoint to remove the item from the user's content
  const response = await esriRequest(
    `${portalUrl}/sharing/rest/content/users/${portal.user.username}/items/${itemId}/delete`,
    { authMode: 'auto', method: 'post', body: form }
  )

  if (!response?.data?.success) {
    throw new Error(response?.data?.error?.message || 'Failed to delete workspace session')
  }
}

// -------------------------------------------------------------------------------------
//  HELPER FUNCTIONS
// -------------------------------------------------------------------------------------
/**
 * Restores a layer configuration to the map.
 * @param map The map instance.
 * @param cfg The layer configuration to restore.
 * @returns A promise that resolves when the layer is restored.
 */
const restoreLayerConfig = async (map: Map, cfg: LayerConfig): Promise<void> => {

  // try to find an existing layer with the same ID
  let layer = map.layers.find(l => l.id === cfg.id)  

  // If no layer with the same ID exists, try to find one with the same URL 
  if (!layer && cfg.url) {
    layer = map.layers.find(l => (l as any).url === cfg.url)  
  }

  // If still no layer is found but the config has a URL, attempt to recreate the layer based on its type and URL
  if (!layer && cfg.url) {
    try {
      if (cfg.type === 'feature') {
        layer = new FeatureLayer({ url: cfg.url, id: cfg.id, title: cfg.title })
      } else if (cfg.type === 'map-image') {
        layer = new MapImageLayer({ url: cfg.url, id: cfg.id, title: cfg.title })
      }
      if (layer) {
        map.add(layer)
        await layer.load()
      }
    } catch (e) {
      console.warn('Could not recreate layer', cfg.id, e)
      return
    }
  }

  if (!layer) {
    console.warn('Layer not found and could not be recreated', cfg.id)
    return
  }

  layer.visible = cfg.visible
  layer.opacity = cfg.opacity

  if (cfg.definitionExpression !== undefined && 'definitionExpression' in layer) {
    (layer as any).definitionExpression = cfg.definitionExpression
  }

  if (cfg.labelingInfo && 'labelingInfo' in layer) {
    try { 
      (layer as any).labelingInfo = cfg.labelingInfo 
    } catch { 
      /* ignore */ 
    }
  }
}

/**
 * Extracts the configuration of each layer in the map.
 * @param layers The layers to extract configurations from.
 * @returns A promise that resolves to an array of layer configurations.
 */
const extractLayerConfigs = async (layers: Layer[]): Promise<LayerConfig[]> => {
  const configs: LayerConfig[] = []

  for (const layer of layers) {
    try {
      const cfg: LayerConfig = {
        id: layer.id,
        type: layer.type,
        title: layer.title,
        visible: layer.visible,
        opacity: layer.opacity
      }

      if ((layer as any).url) cfg.url = (layer as any).url
      if ((layer as any).definitionExpression !== undefined) cfg.definitionExpression = (layer as any).definitionExpression

      if (Array.isArray((layer as any).labelingInfo)) {
        try {
          // labelingInfo can contain complex objects, so we attempt to serialize them to JSON compatible format
          cfg.labelingInfo = (layer as any).labelingInfo.map((li: any) => li?.toJSON ? li.toJSON() : li)
        } catch { /* ignore */ }
      }

      configs.push(cfg)
    } catch (e) {
      console.warn('Failed to extract layer config', layer?.id, e)
    }
  }

  return configs
}