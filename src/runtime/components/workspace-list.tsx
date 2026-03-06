/* eslint-disable no-prototype-builtins */
/** @jsx jsx */
import { jsx } from 'jimu-core'
import { Icon } from 'jimu-ui'
import { type Workspace } from '../models'
// import DeleteIcon from '../assets/icons/delete.svg'
// import EditIcon from '../assets/icons/edit.svg'
import EditIcon from "jimu-icons/svg/outlined/editor/edit.svg"
import DeleteIcon from "jimu-icons/svg/outlined/editor/trash.svg"
import EmptyIcon from "jimu-icons/svg/outlined/data/column.svg"

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
    <div className="session-list">
      {props.data.length === 0 && (
        <div className="no-content">
          <Icon className="no-content-icon" icon={EmptyIcon} size={40}/>
          
          <p>No saved sessions</p>
          <p>Click <b>+</b> to save your current workspace</p>
        </div>
      )}

      {props.data.map((workspace: Workspace) => (
        <div
          className="session-item"
          key={workspace.id}
          onClick={(ev) => { onOpenClick(ev, workspace) }}
        >
          <div className="session-item-label">
            {workspace.label}
          </div>
          <div className="session-item-icon-wrappers">
            <div
              className="session-item-icon-wrapper session-item-icon-wrapper-clickable"
              onClick={(ev) => { onEditClick(ev, workspace) }}
            >
              <Icon className="session-item-icon" title="Edit Session" icon={EditIcon} size={20}/>
            </div>
            <div
              className="session-item-icon-wrapper session-item-icon-wrapper-clickable"
              onClick={(ev) => { onDeleteClick(ev, workspace) }}
            >
              <Icon className="session-item-icon" title="Delete Session" icon={DeleteIcon} size={20}/>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}