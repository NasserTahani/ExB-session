export interface Workspace {
  id: string
  label: string
  [key: string]: any
}

export interface LayerConfig {
  id: string
  type: string
  title?: string
  url?: string
  visible: boolean
  opacity: number
  renderer: any
  definitionExpression?: string
  labelingInfo?: any[]
}

export interface MapSessionState {
  basemapId: string
  basemapJSON?: any            
  basemapSnapshot?: BasemapSnapshot        
  extent: any
  zoom?: number
  rotation?: number
  layers: LayerConfig[]
}

export interface WorkspacePayload {
  valid: boolean
  created: string
  modified?: string
  mapSession: MapSessionState
  data: Workspace
}

export interface BasemapSnapshot {
  id: string
  portalItemId: string
  title: string
  baseLayers: BasemapLayerInfo[]
  referenceLayers: BasemapLayerInfo[]
}

export interface BasemapLayerInfo {
  url: string
  type: string
  title?: string
  opacity?: number
  visible?: boolean
  styleUrl?: string
}