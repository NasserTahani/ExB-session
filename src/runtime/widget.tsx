/** @jsx jsx */
import { React, jsx, type AllWidgetProps, getAppStore } from 'jimu-core'
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis'
import Portal from 'esri/portal/Portal'
import { type IMConfig } from '../config'
import { type Workspace } from './models'
import {
  saveMapSession,
  updateMapSession,
  importMapSession,
  listMapSessions,
  loadMapSession,
  deleteMapSession
} from './workspace-manager'
import { WorkspaceList } from './components/workspace-list'
import { WorkspaceItemEditor, type SaveMode } from './components/workspace-item-editor'
import { WorkspaceItemShare } from './components/workspace-item-share'
import './assets/style.scss'

const { useState, useRef, useCallback, useEffect } = React

export default function Widget (props: AllWidgetProps<IMConfig>) {
  const { useMapWidgetIds } = props

  // State variables
  const [jimuMapView, setJimuMapView] = useState<JimuMapView | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Editor state: null = closed, Workspace object = open with that data
  const [editorData, setEditorData] = useState<Workspace | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Workspace | null>(null)

  const portalRef = useRef<Portal | null>(null)

  /**
   * Utility to get or create the Portal instance. 
   * @returns Portal instance
   */
  const getPortal = useCallback((): Portal => {
    if (!portalRef.current) {
      const portalUrl = getAppStore().getState().portalUrl
      portalRef.current = new Portal({ url: portalUrl })
    }
    return portalRef.current
  }, [])

  /**
   * Utility to run an async function with loading and error handling. 
   * @param fn Async function to run
   * @returns Result of the function or undefined on error
   */
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


  /**
   * Generate a timestamp string for versioning saved sessions. Format: "dd-MM-yyyy HH:mm".
   * @returns Formatted timestamp string
   */
  const getTimestamp = () => new Date().toLocaleString('en-NZ', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
        hour12: false
      }).replace(/[/]/g, '-')

  /**
   * Fetch the list of saved sessions from the portal and update state.
   * @param requiredWorkspace Optional workspace to use if it is missing from search
   * @returns Promise that resolves when the list is refreshed
   */
  const refreshList = useCallback(async (requiredWorkspace?: Workspace) => {
    const list = await run(() => listMapSessions(getPortal()))
    if (list) {
      const nextList = requiredWorkspace && !list.some(w => w.id === requiredWorkspace.id)
        ? [requiredWorkspace, ...list]
        : list
      setWorkspaces(nextList)
    }
  }, [getPortal, run])

  /**
   * Handle saving a session from the editor. Depending on the mode, this may create a new session or update an existing one.
   * @param ws Workspace data from the editor
   * @param mode Save mode ('save' to overwrite, 'save-version' to save a copy)
   */
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
      const versionedWs: Workspace = {
        ...ws,
        id: '',  // force new item
        label: `${ws.label} (${getTimestamp()})`
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

  /**
   * Handle opening a session when the user clicks the open button.
   * @param ws Workspace to open
   */
  const handleWorkspaceOpen = useCallback(async (ws: Workspace) => {
    if (!jimuMapView) {
      setError('No map view available – please connect a Map widget')
      return
    }
    const loaded = await run(() => loadMapSession(getPortal(), ws.id, jimuMapView))
    if (loaded) {
      await refreshList(ws)
    }
  }, [jimuMapView, getPortal, refreshList, run])

  /**
   * Handle editing a session when the user clicks the edit button.
   * @param ws Workspace to edit
   */
  const handleWorkspaceEdit = useCallback((ws: Workspace) => {
    setEditorData(ws)
  }, [])

  /**
   * Handle deleting a session when the user clicks the delete button.
   * @param ws Workspace to delete
   */
  const handleWorkspaceDelete = useCallback((ws: Workspace) => {
    setConfirmDelete(ws)
  }, [])

  /**
   * Import a shared session into the current user's content, then load it and refresh the list.
   * @param sourceItemId Shared portal item id to import
   */
  const handleImportSave = useCallback(async (sourceItemId: string) => {
    if (!jimuMapView) {
      setError('No map view available')
      return
    }

    const imported = await run(() => importMapSession(getPortal(), sourceItemId))
    if (!imported) {
      return
    }

    setImportOpen(false)
    setWorkspaces(prev => prev.some(w => w.id === imported.id) ? prev : [imported, ...prev])

    const loaded = await run(() => loadMapSession(getPortal(), imported.id, jimuMapView))
    if (loaded) {
      await refreshList(imported)
    }
  }, [jimuMapView, getPortal, refreshList, run])

  /**
   * Confirm and execute the deletion of a workspace.
   */
  const confirmDeleteAction = useCallback(async () => {
    if (!confirmDelete) return
    setLoading(true)
    setError(null)
    try {
      await deleteMapSession(getPortal(), confirmDelete.id)
      setWorkspaces(prev => prev.filter(w => w.id !== confirmDelete.id))
      setConfirmDelete(null)
    } catch (e: any) {
      console.error(e)
      setError(e?.message || 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }, [confirmDelete, getPortal])

  /**
   * Handle changes to the active map view. 
   * @param jmv The active JimuMapView instance
   */
  const onActiveViewChange = useCallback((jmv: JimuMapView) => {
    setJimuMapView(jmv)
  }, [])

  useEffect(() => {
    if (jimuMapView) {
      refreshList()
    }
  }, [jimuMapView, refreshList])


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

      {/* Error banner */}
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button className="dismiss-btn" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* "New Session" button */}
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
          onClick={() => setImportOpen(true)}
        >
          Import a Session
        </button>

        <button
          className="jimu-btn"
          disabled={loading}
          onClick={() => { void refreshList() }}
        >
          Refresh
        </button>
      </div>

      {/* Session list */}
      <WorkspaceList
        data={workspaces}
        onWorkspaceOpen={handleWorkspaceOpen}
        onWorkspaceEdit={handleWorkspaceEdit}
        onWorkspaceDelete={handleWorkspaceDelete}
      />

      {/* Editor modal */}
      {editorData && (
        <WorkspaceItemEditor
          data={editorData}
          onSave={handleEditorSave}
          onClose={() => setEditorData(null)}
        />
      )}

      {/* Import modal */}
      {importOpen && (
        <WorkspaceItemShare
          onSave={handleImportSave}
          onClose={() => setImportOpen(false)}
        />
      )}

      {/* Delete confirmation modal */}
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

      {/* Footer */}
      <div className="info-footer workspaces-content-center">
        {workspaces.length > 0 && <span>{workspaces.length} session(s)</span>}
      </div>
    </div>
  )
}
