import esriRequest from 'esri/request'
import Portal from 'esri/portal/Portal'
import { JimuMapView } from 'jimu-arcgis'
import { Workspace, MapSessionState, WorkspacePayload, LayerConfig } from './models'
import { React, type AllWidgetProps, css, jsx, SessionManager, getAppStore } from 'jimu-core'
import Basemap from 'esri/Basemap'
import FeatureLayer from 'esri/layers/FeatureLayer'
import MapImageLayer from 'esri/layers/MapImageLayer'
import Extent from 'esri/geometry/Extent'


const portalTags = 'ExB-session,workspace,map-config'

/**
 * Returns the portal URL and a valid token for REST calls.
 */
const getPortalSession = () => {
  const session = SessionManager.getInstance().getMainSession()
  const portalUrl = getAppStore().getState().portalUrl
  return { portalUrl, token: session.token }
}

/**
 * Ensures the portal is loaded and the user is authenticated.
 */
const ensurePortalUser = async (portal: Portal): Promise<void> => {
  portal.authMode = 'immediate'
  await portal.load()
  if (!portal.user) throw new Error('User not authenticated')
}

// ────────────────────────────────────────────────────────────────
//  SAVE / UPDATE (shared payload builder)
// ────────────────────────────────────────────────────────────────

/**
 * Builds the payload containing map session state for saving/updating.
 */
const buildPayload = async (
  data: Workspace,
  jimuMapView: JimuMapView,
  preserveCreated?: string
): Promise<WorkspacePayload> => {
  if (!jimuMapView?.view) throw new Error('Map view is required to save session')

  const view = jimuMapView.view
  const map = view.map

  const layerConfigs = await extractLayerConfigs(map.layers.toArray())

  const sessionState: MapSessionState = {
    basemapId: map.basemap?.id || undefined,
    extent: view.extent?.toJSON(),
    zoom: view.zoom,
    layers: layerConfigs
  }

  return {
    workspace: true,
    version: '1.0',
    created: preserveCreated || new Date().toISOString(),
    mapSession: sessionState,
    data: {
      ...data
    }
  }
}

// ────────────────────────────────────────────────────────────────
//  SAVE
// ────────────────────────────────────────────────────────────────

/**
 * Saves the current state of a map session, including its extent, layers,
 * and basemap information, to an ArcGIS portal as a new item.
 * Returns a Workspace object that includes the new item's ID and title.
 */
export const saveMapSession = async (
  portal: Portal,
  data: Workspace,
  jimuMapView: JimuMapView,
  tags = portalTags
): Promise<Workspace> => {

  await ensurePortalUser(portal)

  const payload = await buildPayload(data, jimuMapView)
  const title = data.label

  const { portalUrl, token } = getPortalSession()

  const addItemUrl = `${portalUrl}/sharing/rest/content/users/${portal.user.username}/addItem`

  const form = new FormData()
  form.append('f', 'json')
  form.append('title', title)
  form.append('type', 'Application Configuration')
  form.append('token', token)
  form.append('tags', tags)
  form.append('text', JSON.stringify(payload))

  const response = await esriRequest(addItemUrl, {
    authMode: 'auto',
    method: 'post',
    body: form
  })

  if (!response?.data?.success) {
    throw new Error(response?.data?.error?.message || 'Failed to save workspace session')
  }

  return {
    ...data,
    id: response.data.id
  }
}

// ────────────────────────────────────────────────────────────────
//  UPDATE
// ────────────────────────────────────────────────────────────────

/**
 * Updates an existing workspace session item in the portal.
 * Returns the updated Workspace object.
 */
export const updateMapSession = async (
  portal: Portal,
  data: Workspace,
  jimuMapView: JimuMapView,
  tags = portalTags
): Promise<Workspace> => {

  await ensurePortalUser(portal)

  if (!data.id) throw new Error('Item ID is required to update session')

  const { portalUrl, token } = getPortalSession()

  // Fetch existing item to preserve the created timestamp
  const dataUrl = `${portalUrl}/sharing/rest/content/items/${data.id}/data`
  const existingResponse = await esriRequest(dataUrl, {
    authMode: 'auto',
    query: { f: 'json', token }
  })
  const existingPayload: WorkspacePayload = existingResponse?.data
  const createdTimestamp = existingPayload?.created

  const payload = await buildPayload(data, jimuMapView, createdTimestamp)
  const title = data.label

  const updateUrl = `${portalUrl}/sharing/rest/content/users/${portal.user.username}/items/${data.id}/update`

  const form = new FormData()
  form.append('f', 'json')
  form.append('title', title)
  form.append('token', token)
  form.append('tags', tags)
  form.append('text', JSON.stringify(payload))

  const response = await esriRequest(updateUrl, {
    authMode: 'auto',
    method: 'post',
    body: form
  })

  if (!response?.data?.success) {
    throw new Error(response?.data?.error?.message || 'Failed to update workspace session')
  }

  return {
    ...data
  }
}

// ─────────────────────────────────────────────────────────────
//  LIST
// ─────────────────────────────────────────────────────────────

/**
 * Lists all saved workspace sessions for the current portal user.
 * Searches for portal items of type "Application Configuration" that
 * carry the workspace portal tags and belong to the authenticated user.
 * Returns an array of Workspace objects (id + label).
 */
export const listMapSessions = async (
  portal: Portal,
  tags = portalTags
): Promise<Workspace[]> => {

  await ensurePortalUser(portal)

  const { portalUrl, token } = getPortalSession()

  const tagQuery = tags.split(',').map(t => `tags:"${t.trim()}"`).join(' AND ')
  const searchQuery = `${tagQuery} AND type:"Application Configuration" AND owner:${portal.user.username}`

  const searchUrl = `${portalUrl}/sharing/rest/search`

  const form = new FormData()
  form.append('f', 'json')
  form.append('q', searchQuery)
  form.append('num', '100')
  form.append('sortField', 'modified')
  form.append('sortOrder', 'desc')
  form.append('token', token)

  const response = await esriRequest(searchUrl, {
    authMode: 'auto',
    method: 'post',
    body: form
  })

  const results: any[] = response?.data?.results || []

  return results.map((item: any) => ({
    id: item.id,
    label: item.title
  }))
}

// ────────────────────────────────────────────────────────────────
//  LOAD
// ────────────────────────────────────────────────────────────────

/**
 * Loads a previously saved workspace session from the portal and restores
 * its map state onto the provided JimuMapView.
 * Returns the full WorkspacePayload so the caller can inspect metadata.
 */
export const loadMapSession = async (
  portal: Portal,
  itemId: string,
  jimuMapView: JimuMapView
): Promise<WorkspacePayload> => {

  await ensurePortalUser(portal)

  if (!jimuMapView?.view) throw new Error('Map view is required to load session')

  const { portalUrl, token } = getPortalSession()

  // 1. Fetch the item's JSON data
  const dataUrl = `${portalUrl}/sharing/rest/content/items/${itemId}/data`

  const response = await esriRequest(dataUrl, {
    authMode: 'auto',
    query: { f: 'json', token }
  })

  const payload: WorkspacePayload = response?.data
  if (!payload?.workspace) {
    throw new Error('Item is not a valid workspace session')
  }

  const { mapSession } = payload
  const view = jimuMapView.view
  const map = view.map

  // 2. Restore basemap
  if (mapSession.basemapId) {
    try {
      map.basemap = Basemap.fromId(mapSession.basemapId) ?? map.basemap
    } catch {
      console.warn('Could not restore basemap', mapSession.basemapId)
    }
  }

  // 3. Restore extent / zoom
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

  // 4. Restore layers
  if (Array.isArray(mapSession.layers)) {
    for (const cfg of mapSession.layers) {
      await restoreLayerConfig(map, cfg)
    }
  }

  return payload
}

/**
 * Applies a saved LayerConfig onto a layer already present in the map,
 * or creates the layer from its URL if it's missing.
 */
const restoreLayerConfig = async (
  map: __esri.Map,
  cfg: LayerConfig
): Promise<void> => {
  // Try to find an existing layer first
  let layer: __esri.Layer | undefined =
    map.layers.find(l => l.id === cfg.id) as __esri.Layer | undefined

  // If not found by id, try to match by URL (for URL-backed layers)
  if (!layer && cfg.url) {
    layer = map.layers.find(l => (l as any).url === cfg.url) as __esri.Layer | undefined
  }

  // If still not found but we have a URL, re-create the layer
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

  // Apply common properties
  layer.visible = cfg.visible
  layer.opacity = cfg.opacity

  // Apply FeatureLayer-specific properties
  if (cfg.definitionExpression !== undefined && 'definitionExpression' in layer) {
    ;(layer as any).definitionExpression = cfg.definitionExpression
  }

  if (cfg.labelingInfo && 'labelingInfo' in layer) {
    try {
      ;(layer as any).labelingInfo = cfg.labelingInfo
    } catch {
      // ignore
    }
  }
}

// ────────────────────────────────────────────────────────────────
//  DELETE
// ────────────────────────────────────────────────────────────────

/**
 * Deletes a saved workspace session item from the portal.
 * Throws if the item cannot be deleted (permissions, network, etc.).
 */
export const deleteMapSession = async (
  portal: Portal,
  itemId: string
): Promise<void> => {

  await ensurePortalUser(portal)

  const { portalUrl, token } = getPortalSession()

  const deleteUrl =
    `${portalUrl}/sharing/rest/content/users/${portal.user.username}/items/${itemId}/delete`

  const form = new FormData()
  form.append('f', 'json')
  form.append('token', token)

  const response = await esriRequest(deleteUrl, {
    authMode: 'auto',
    method: 'post',
    body: form
  })

  if (!response?.data?.success) {
    throw new Error(response?.data?.error?.message || 'Failed to delete workspace session')
  }
}


/**
 * Extract per-layer state for restoring later.
 * Extend this as needed (supports FeatureLayer properties best).
 */
const extractLayerConfigs = async (layers: __esri.Layer[]): Promise<LayerConfig[]> => {
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

      // URL-backed layers (FeatureLayer, MapImageLayer)
      if ((layer as any).url) {
        cfg.url = (layer as any).url
      }

      // definitionExpression (FeatureLayer)
      if ((layer as any).definitionExpression !== undefined) {
        cfg.definitionExpression = (layer as any).definitionExpression
      }

      // labeling info (FeatureLayer)
      if (Array.isArray((layer as any).labelingInfo)) {
        try {
          cfg.labelingInfo = (layer as any).labelingInfo.map((li: any) =>
            li?.toJSON ? li.toJSON() : li
          )
        } catch {
          // ignore
        }
      }

      configs.push(cfg)
    } catch (e) {
      // Keep going if a layer cannot be serialized
      console.warn('Failed to extract layer config', layer?.id, e)
    }
  }

  return configs
}