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
  definitionExpression?: string
  labelingInfo?: any[]
}

export interface MapSessionState {
  basemapId: string
  extent: any
  zoom?: number
  rotation?: number
  layers: LayerConfig[]
}

export interface WorkspacePayload {
  workspace: boolean
  version: string
  created: string
  modified?: string
  mapSession: MapSessionState
  data: Workspace
}

