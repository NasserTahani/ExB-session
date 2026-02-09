/* eslint-disable no-prototype-builtins */
/** @jsx jsx */
import { jsx } from 'jimu-core'
import { Icon } from 'jimu-ui'
import { type Workspace } from '../models'
import DeleteIcon from '../assets/icons/delete.svg'
import EditIcon from '../assets/icons/edit.svg'

export interface WorkspaceListProps {
  data: Workspace[]
  onWorkspaceOpen: (workspace: Workspace) => void
  onWorkspaceEdit: (workspace: Workspace) => void
  onWorkspaceDelete: (workspace: Workspace) => void
}

/**
 * Renders the scrollable list of saved workspace sessions.
 * - Clicking the row label loads (opens) the session.
 * - The edit icon opens the editor modal for renaming.
 * - The delete icon triggers deletion (with confirmation handled by the parent).
 */
export const WorkspaceList = function (props: WorkspaceListProps) {
  const onOpenClick = (ev: React.MouseEvent, ws: Workspace) => {
    ev.stopPropagation()
    props.onWorkspaceOpen(ws)
  }

  const onEditClick = (ev: React.MouseEvent, ws: Workspace) => {
    ev.stopPropagation()
    props.onWorkspaceEdit(ws)
  }

  const onDeleteClick = (ev: React.MouseEvent, ws: Workspace) => {
    ev.stopPropagation()
    props.onWorkspaceDelete(ws)
  }

  return (
    <div className="save-sessions-list">
      {props.data.length === 0 && (
        <p className="info-text workspaces-content-center">No sessions saved yet</p>
      )}

      {props.data.map((workspace: Workspace) => (
        <div
          className="save-sessions-item"
          key={workspace.id}
          onClick={(ev) => { onOpenClick(ev, workspace) }}
        >
          <div className="workspace-list-label p-2">
            {workspace.label}
          </div>
          <div className="workspace-list-icon-wrappers">
            <div
              className="workspace-list-icon-wrapper workspace-list-icon-wrapper-clickable"
              onClick={(ev) => { onEditClick(ev, workspace) }}
            >
              <Icon className="workspace-list-icon" title="Edit Session" icon={EditIcon} />
            </div>
            <div
              className="workspace-list-icon-wrapper workspace-list-icon-wrapper-clickable"
              onClick={(ev) => { onDeleteClick(ev, workspace) }}
            >
              <Icon className="workspace-list-icon" title="Delete Session" icon={DeleteIcon} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}