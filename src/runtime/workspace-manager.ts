import esriRequest from 'esri/request'
import Portal from 'esri/portal/Portal'
import { JimuMapView } from 'jimu-arcgis'
import { Workspace, MapSessionState, WorkspacePayload, LayerConfig } from './models'
import { React, type AllWidgetProps, css, jsx, SessionManager, getAppStore } from 'jimu-core'


const portalTags = 'ExB-session,workspace,map-config'

/**
 * This asynchronous function saves the current state of a map session, including its extent, layers, and basemap information, to an ArcGIS portal as a new item. 
 * It constructs a payload with the session data and sends it to the portal's addItem endpoint, returning a Workspace object that includes the new item's ID and title.
 */
export const saveMapSession = async (
  portal: Portal,
  data: Workspace,
  jimuMapView: JimuMapView,
  portalTags = 'ExB-session,workspace,map-config'
): Promise<Workspace> => {

  portal.authMode = 'immediate'
  await portal.load()

  if (!portal.user) throw new Error('User not authenticated')
  if (!jimuMapView?.view) throw new Error('Map view is required to save session')

  const view = jimuMapView.view
  const map = view.map

  const layerConfigs = await extractLayerConfigs(map.layers.toArray())

  const sessionState: MapSessionState = {
    basemapId: map.basemap?.id || 'topo-vector',
    extent: view.extent?.toJSON(),
    zoom: view.zoom,
    layers: layerConfigs
  }

  let title = data.label
//   if (data.id) {
//     const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, '')
//     title = `${data.label}_${yyyymmdd}`
//   }
// versioning for later use, for now we just overwrite existing item if id exists

  const payload: WorkspacePayload = {
    workspace: true,
    version: '1.0',
    created: new Date().toISOString(),
    mapSession: sessionState,
    data: {
      ...data,
      label: title
    }
  }

  const session = SessionManager.getInstance().getMainSession()
  const portalUrl = getAppStore().getState().portalUrl

  const addItemUrl = `${portalUrl}/sharing/rest/content/users/${portal.user.username}/addItem`

  const form = new FormData()
  form.append('f', 'json')
  form.append('title', title)
  form.append('type', 'Application Configuration')
  form.append('token', session.token)
  form.append('tags', portalTags)
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
    id: response.data.id,
    label: title
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

