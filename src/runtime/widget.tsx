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
import { WorkspaceItemEditor, type SaveMode } from './components/workspace-item-editor'
import './assets/style.scss'

const { useState, useRef, useCallback, useEffect } = React

export default function Widget (props: AllWidgetProps<IMConfig>) {
  const { useMapWidgetIds } = props

  // ── state ──
  const [jimuMapView, setJimuMapView] = useState<JimuMapView | null>(null)
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

  // ── wrap async actions with loading / error handling ──
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setLoading(true)
    setError(null)
    try {
      return await fn()
    } catch (e: any) {
      console.error(e)
      setError(e?.message || 'An unexpected error occurred')
      return undefined
    } finally {
      setLoading(false)
    }
  }, [])

  // ── refresh the session list ���─
  const refreshList = useCallback(async () => {
    const list = await run(() => listMapSessions(getPortal()))
    if (list) setWorkspaces(list)
  }, [getPortal, run])

  // ── SAVE / UPDATE (from editor modal) ──
  const handleEditorSave = useCallback(async (ws: Workspace, mode: SaveMode) => {
    if (!jimuMapView) {
      setError('No map view available – please connect a Map widget')
      return
    }

    const isExisting = !!ws.id  // convert non-empty string to boolean
    let saved: Workspace | undefined

    if (isExisting && mode === 'save') {
      // Overwrite the existing portal item
      saved = await run(() => updateMapSession(getPortal(), ws, jimuMapView))
    } else if (isExisting && mode === 'save-version') {
      // Create a new item with a timestamped name
      const timestamp = new Date().toLocaleString('en-NZ', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
        hour12: false
      }).replace(/[/]/g, '-')
      const versionedWs: Workspace = {
        ...ws,
        id: '',  // force new item
        label: `${ws.label} (${timestamp})`
      }
      saved = await run(() => saveMapSession(getPortal(), versionedWs, jimuMapView))
    } else {
      // Brand new session
      saved = await run(() => saveMapSession(getPortal(), ws, jimuMapView))
    }

    if (saved) {
      setEditorData(null)
      setWorkspaces(prev => {
        const exists = prev.some(w => w.id === saved.id)
        if (exists) {
          return prev.map(w => w.id === saved.id ? saved : w)
        }
        return [saved, ...prev]
      })
    }
  }, [jimuMapView, getPortal, run])

  // ── LOAD (click on a row) ──
  const handleWorkspaceOpen = useCallback(async (ws: Workspace) => {
    if (!jimuMapView) {
      setError('No map view available – please connect a Map widget')
      return
    }
    await run(() => loadMapSession(getPortal(), ws.id, jimuMapView))
  }, [jimuMapView, getPortal, run])

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
    await run(() => deleteMapSession(getPortal(), confirmDelete.id))
    setWorkspaces(prev => prev.filter(w => w.id !== confirmDelete.id))
    setConfirmDelete(null)
  }, [confirmDelete, getPortal, run])

  // ── map view ready → fetch list ──
  const onActiveViewChange = useCallback((jmv: JimuMapView) => {
    setJimuMapView(jmv)
  }, [])

  useEffect(() => {
    if (jimuMapView) {
      refreshList()
    }
  }, [jimuMapView, refreshList])

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
        <button
          className="jimu-btn"
          disabled={loading}
          onClick={refreshList}
        >
          Refresh
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