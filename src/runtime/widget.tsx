/** @jsx jsx */
import { React, jsx, type AllWidgetProps, getAppStore } from 'jimu-core'
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis'
import Portal from 'esri/portal/Portal'
import { type IMConfig } from '../config'
import { type Workspace } from './models'
import {
  saveMapSession,
  updateMapSession,
  listMapSessions,
  loadMapSession,
  deleteMapSession
} from './workspace-manager'
import { WorkspaceList } from './components/workspace-list'
import { WorkspaceItemEditor } from './components/workspace-item-editor'
import './assets/style.scss'

const { useState, useRef, useCallback, useEffect } = React

export default function Widget (props: AllWidgetProps<IMConfig>) {
  const { useMapWidgetIds } = props

  // ── state ──
  const jimuMapViewRef = useRef<JimuMapView | null>(null)
  const [mapViewReady, setMapViewReady] = useState(false)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Editor modal state: null = closed, Workspace object = open
  const [editorData, setEditorData] = useState<Workspace | null>(null)
  // Delete confirmation state: null = none pending
  const [confirmDelete, setConfirmDelete] = useState<Workspace | null>(null)

  const portalRef = useRef<Portal | null>(null)

  // ── portal helper ──
  const getPortal = useCallback((): Portal => {
    if (!portalRef.current) {
      const portalUrl = getAppStore().getState().portalUrl
      portalRef.current = new Portal({ url: portalUrl })
    }
    return portalRef.current
  }, [])

  // ── private helper: fetch sessions without managing loading state ──
  const fetchSessions = useCallback(async (): Promise<Workspace[]> => {
    return await listMapSessions(getPortal())
  }, [getPortal])

  // ── private helper: refresh workspaces list ──
  const refreshWorkspaces = useCallback(async () => {
    const list = await fetchSessions()
    setWorkspaces(list)
  }, [fetchSessions])

  // ── refresh the session list (with loading state) ──
  const refreshList = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await refreshWorkspaces()
    } catch (e: any) {
      console.error(e)
      setError(e?.message || 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }, [refreshWorkspaces])

  // ── SAVE / UPDATE (from editor modal) ──
  const handleEditorSave = useCallback(async (ws: Workspace) => {
    const jimuMapView = jimuMapViewRef.current
    if (!jimuMapView) {
      setError('No map view available – please connect a Map widget')
      return
    }

    setLoading(true)
    setError(null)
    try {
      // Use updateMapSession if ws.id exists, otherwise saveMapSession
      if (ws.id) {
        await updateMapSession(getPortal(), ws, jimuMapView)
      } else {
        await saveMapSession(getPortal(), ws, jimuMapView)
      }
      // Fetch and update the list directly
      await refreshWorkspaces()
      setEditorData(null)
    } catch (e: any) {
      console.error(e)
      setError(e?.message || 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }, [getPortal, refreshWorkspaces])

  // ── LOAD (click on a row) ──
  const handleWorkspaceOpen = useCallback(async (ws: Workspace) => {
    const jimuMapView = jimuMapViewRef.current
    if (!jimuMapView) {
      setError('No map view available – please connect a Map widget')
      return
    }

    setLoading(true)
    setError(null)
    try {
      await loadMapSession(getPortal(), ws.id, jimuMapView)
    } catch (e: any) {
      console.error(e)
      setError(e?.message || 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }, [getPortal])

  // ── EDIT (pencil icon → open modal with existing data) ──
  const handleWorkspaceEdit = useCallback((ws: Workspace) => {
    setEditorData(ws)
  }, [])

  // ── DELETE (trash icon → confirm → delete) ──
  const handleWorkspaceDelete = useCallback((ws: Workspace) => {
    setConfirmDelete(ws)
  }, [])

  const confirmDeleteAction = useCallback(async () => {
    if (!confirmDelete) return

    setLoading(true)
    setError(null)
    try {
      await deleteMapSession(getPortal(), confirmDelete.id)
      // Fetch and update the list directly
      await refreshWorkspaces()
      setConfirmDelete(null)
    } catch (e: any) {
      console.error(e)
      setError(e?.message || 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }, [confirmDelete, getPortal, refreshWorkspaces])

  // ── map view ready → fetch list ──
  const onActiveViewChange = useCallback((jmv: JimuMapView) => {
    jimuMapViewRef.current = jmv
    setMapViewReady(true)
  }, [])

  useEffect(() => {
    if (mapViewReady) {
      refreshList()
    }
  }, [mapViewReady, refreshList])

  // ────────────────────────────────────────────────────────────────
  //  Render
  // ────────────────────────────────────────────────────────────────

  return (
    <div className="widget-save-sessions jimu-widget">

      {/* Map view binding */}
      {useMapWidgetIds?.length > 0 && (
        <JimuMapViewComponent
          useMapWidgetId={useMapWidgetIds[0]}
          onActiveViewChange={onActiveViewChange}
        />
      )}

      {/* Loading overlay */}
      {loading && <div className="workspace-loading-mask" />}

      {/* ── Error banner ── */}
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button className="dismiss-btn" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* ── "New Session" button ── */}
      <div className="save-section workspaces-content-center">
        <button
          className="jimu-btn jimu-btn-primary"
          disabled={loading}
          onClick={() => setEditorData({ id: '', label: '' })}
        >
          Save Current Session
        </button>
      </div>

      {/* ── Session list (child component) ── */}
      <WorkspaceList
        data={workspaces}
        onWorkspaceOpen={handleWorkspaceOpen}
        onWorkspaceEdit={handleWorkspaceEdit}
        onWorkspaceDelete={handleWorkspaceDelete}
      />

      {/* ── Editor modal (child component) ── */}
      {editorData && (
        <WorkspaceItemEditor
          data={editorData}
          onSave={handleEditorSave}
          onClose={() => setEditorData(null)}
        />
      )}

      {/* ── Delete confirmation modal ── */}
      {confirmDelete && (
        <div className="delete-confirm-overlay">
          <div className="delete-confirm-dialog">
            <p>Delete "<strong>{confirmDelete.label}</strong>"?</p>
            <div className="delete-confirm-actions">
              <button
                className="jimu-btn jimu-btn-danger"
                onClick={confirmDeleteAction}
              >
                Delete
              </button>
              <button
                className="jimu-btn"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="info-footer workspaces-content-center">
        {workspaces.length > 0 && <span>{workspaces.length} session(s)</span>}
      </div>
    </div>
  )
}
