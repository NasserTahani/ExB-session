import esriRequest from 'esri/request'
import Portal from 'esri/portal/Portal'
import { JimuMapView } from 'jimu-arcgis'
import { Workspace, MapSessionState, WorkspacePayload, LayerConfig } from './models'
import { SessionManager, getAppStore } from 'jimu-core'
import Basemap from 'esri/Basemap'
import FeatureLayer from 'esri/layers/FeatureLayer'
import MapImageLayer from 'esri/layers/MapImageLayer'
import TileLayer from 'esri/layers/TileLayer'
import VectorTileLayer from 'esri/layers/VectorTileLayer'
import WebTileLayer from 'esri/layers/WebTileLayer'
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
//  BASEMAP helpers
// ────────────────────────────────────────────────────────────────

interface BasemapLayerInfo {
  url: string
  type: string
  title?: string
  opacity?: number
  visible?: boolean
  styleUrl?: string
}

interface BasemapSnapshot {
  id: string
  title: string
  baseLayers: BasemapLayerInfo[]
  referenceLayers: BasemapLayerInfo[]
}

const serializeBasemapLayer = (layer: __esri.Layer): BasemapLayerInfo | null => {
  try {
    const info: BasemapLayerInfo = {
      url: (layer as any).url || '',
      type: layer.type,
      title: layer.title,
      opacity: layer.opacity,
      visible: layer.visible
    }
    if (layer.type === 'vector-tile' && (layer as any).url) {
      info.styleUrl = (layer as any).currentStyleInfo?.styleUrl || (layer as any).url
    }
    return info.url ? info : null
  } catch {
    return null
  }
}

const deserializeBasemapLayer = (info: BasemapLayerInfo): __esri.Layer | null => {
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
      case 'web-tile':
        return new WebTileLayer(opts)
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

const snapshotBasemap = (basemap: __esri.Basemap): BasemapSnapshot => {
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

const restoreBasemapFromSnapshot = (snapshot: BasemapSnapshot): Basemap | null => {
  if (snapshot.baseLayers.length > 0) {
    const baseLayers = snapshot.baseLayers
      .map(deserializeBasemapLayer)
      .filter(Boolean) as __esri.Layer[]

    const referenceLayers = snapshot.referenceLayers
      .map(deserializeBasemapLayer)
      .filter(Boolean) as __esri.Layer[]

    if (baseLayers.length > 0) {
      return new Basemap({
        baseLayers,
        referenceLayers,
        title: snapshot.title
      })
    }
  }

  if (snapshot.id) {
    try {
      const wellKnown = Basemap.fromId(snapshot.id)
      if (wellKnown) return wellKnown
    } catch { /* ignore */ }
  }

  return null
}

// ────────────────────────────────────────────────────────────────
//  SHARED: build the map session payload
// ────────────────────────────────────────────────────────────────

const buildPayload = async (
  data: Workspace,
  jimuMapView: JimuMapView
): Promise<{ payload: WorkspacePayload; title: string }> => {
  const view = jimuMapView.view
  const map = view.map

  const layerConfigs = await extractLayerConfigs(map.layers.toArray())

  let basemapSnapshot: BasemapSnapshot | undefined
  try {
    if (map.basemap) {
      basemapSnapshot = snapshotBasemap(map.basemap)
    }
  } catch {
    // ignore
  }

  const sessionState: MapSessionState = {
    basemapId: map.basemap?.id || undefined,
    basemapSnapshot: basemapSnapshot,
    extent: view.extent?.toJSON(),
    zoom: view.zoom,
    layers: layerConfigs
  }

  const title = data.label

  const payload: WorkspacePayload = {
    workspace: true,
    version: '1.0',
    created: new Date().toISOString(),
    mapSession: sessionState,
    data: { ...data, label: title }
  }

  return { payload, title }
}

// ────────────────────────────────────────────────────────────────
//  SAVE (create new item)
// ────────────────────────────────────────────────────────────────

export const saveMapSession = async (
  portal: Portal,
  data: Workspace,
  jimuMapView: JimuMapView,
  tags = portalTags
): Promise<Workspace> => {

  await ensurePortalUser(portal)
  if (!jimuMapView?.view) throw new Error('Map view is required to save session')

  const { payload, title } = await buildPayload(data, jimuMapView)
  const { portalUrl, token } = getPortalSession()

  const form = new FormData()
  form.append('f', 'json')
  form.append('title', title)
  form.append('type', 'Application Configuration')
  form.append('token', token)
  form.append('tags', tags)
  form.append('text', JSON.stringify(payload))

  const response = await esriRequest(
    `${portalUrl}/sharing/rest/content/users/${portal.user.username}/addItem`,
    { authMode: 'auto', method: 'post', body: form }
  )

  if (!response?.data?.success) {
    throw new Error(response?.data?.error?.message || 'Failed to save workspace session')
  }

  return { ...data, id: response.data.id, label: title }
}

// ───────────────────────────────────────────────────────────────
//  UPDATE (overwrite existing item)
// ────────────────────────────────────────────────────────────────

export const updateMapSession = async (
  portal: Portal,
  data: Workspace,
  jimuMapView: JimuMapView,
  tags = portalTags
): Promise<Workspace> => {

  await ensurePortalUser(portal)
  if (!jimuMapView?.view) throw new Error('Map view is required to save session')
  if (!data.id) throw new Error('Cannot update a session without an ID')

  const { payload, title } = await buildPayload(data, jimuMapView)
  payload.modified = new Date().toISOString()

  const { portalUrl, token } = getPortalSession()

  const form = new FormData()
  form.append('f', 'json')
  form.append('title', title)
  form.append('token', token)
  form.append('tags', tags)
  form.append('text', JSON.stringify(payload))

  const response = await esriRequest(
    `${portalUrl}/sharing/rest/content/users/${portal.user.username}/items/${data.id}/update`,
    { authMode: 'auto', method: 'post', body: form }
  )

  if (!response?.data?.success) {
    throw new Error(response?.data?.error?.message || 'Failed to update workspace session')
  }

  return { ...data, label: title }
}

// ────────────────────────────────────────────────────────────────
//  LIST
// ────────────────────���───────────────────────────────────────────

export const listMapSessions = async (
  portal: Portal,
  tags = portalTags
): Promise<Workspace[]> => {

  await ensurePortalUser(portal)

  const { portalUrl, token } = getPortalSession()

  const tagQuery = tags.split(',').map(t => `tags:"${t.trim()}"`).join(' AND ')
  const searchQuery = `${tagQuery} AND type:"Application Configuration" AND owner:${portal.user.username}`

  const form = new FormData()
  form.append('f', 'json')
  form.append('q', searchQuery)
  form.append('num', '100')
  form.append('sortField', 'modified')
  form.append('sortOrder', 'desc')
  form.append('token', token)

  const response = await esriRequest(
    `${portalUrl}/sharing/rest/search`,
    { authMode: 'auto', method: 'post', body: form }
  )

  const results: any[] = response?.data?.results || []
  return results.map((item: any) => ({ id: item.id, label: item.title }))
}

// ────────────────────────────────────────────────────────────────
//  LOAD
// ────────────────────────────────────────────────────────────────

export const loadMapSession = async (
  portal: Portal,
  itemId: string,
  jimuMapView: JimuMapView
): Promise<WorkspacePayload> => {

  await ensurePortalUser(portal)
  if (!jimuMapView?.view) throw new Error('Map view is required to load session')

  const { portalUrl, token } = getPortalSession()

  const response = await esriRequest(
    `${portalUrl}/sharing/rest/content/items/${itemId}/data`,
    { authMode: 'auto', query: { f: 'json', token } }
  )

  const payload: WorkspacePayload = response?.data
  if (!payload?.workspace) {
    throw new Error('Item is not a valid workspace session')
  }

  const { mapSession } = payload
  const view = jimuMapView.view
  const map = view.map

  // 1. Restore basemap
  let basemapRestored = false

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
    const savedLayerUrls = new Set(
      mapSession.layers.filter(cfg => cfg.url).map(cfg => cfg.url)
    )

    const layersToRemove: __esri.Layer[] = []
    map.layers.forEach(layer => {
      const matchById = savedLayerIds.has(layer.id)
      const matchByUrl = (layer as any).url && savedLayerUrls.has((layer as any).url)
      if (!matchById && !matchByUrl) {
        layersToRemove.push(layer)
      }
    })
    for (const layer of layersToRemove) {
      try { map.remove(layer) } catch (e) { console.warn('Could not remove layer', layer.id, e) }
    }

    for (const cfg of mapSession.layers) {
      await restoreLayerConfig(map, cfg)
    }
  }

  return payload
}

// ────────────────────────────────────────────────────────────────
//  DELETE
// ────────────────────────────────────────────────────────────────

export const deleteMapSession = async (
  portal: Portal,
  itemId: string
): Promise<void> => {

  await ensurePortalUser(portal)

  const { portalUrl, token } = getPortalSession()

  const form = new FormData()
  form.append('f', 'json')
  form.append('token', token)

  const response = await esriRequest(
    `${portalUrl}/sharing/rest/content/users/${portal.user.username}/items/${itemId}/delete`,
    { authMode: 'auto', method: 'post', body: form }
  )

  if (!response?.data?.success) {
    throw new Error(response?.data?.error?.message || 'Failed to delete workspace session')
  }
}

// ────────────────────────────────────────────────────────────────
//  HELPERS
// ────────────────────────────────────────────────────────────────

const restoreLayerConfig = async (map: __esri.Map, cfg: LayerConfig): Promise<void> => {
  let layer = map.layers.find(l => l.id === cfg.id)

  if (!layer && cfg.url) {
    layer = map.layers.find(l => (l as any).url === cfg.url)
  }

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
    ;(layer as any).definitionExpression = cfg.definitionExpression
  }

  if (cfg.labelingInfo && 'labelingInfo' in layer) {
    try { ;(layer as any).labelingInfo = cfg.labelingInfo } catch { /* ignore */ }
  }
}

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

      if ((layer as any).url) cfg.url = (layer as any).url
      if ((layer as any).definitionExpression !== undefined) cfg.definitionExpression = (layer as any).definitionExpression

      if (Array.isArray((layer as any).labelingInfo)) {
        try {
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