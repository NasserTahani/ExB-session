/* eslint-disable no-prototype-builtins */
/** @jsx jsx */
import { jsx } from 'jimu-core'
import { Icon } from 'jimu-ui'
import { Workspace } from '../models'
import DeleteIcon from '../assets/icons/delete.svg'
import DefaultIcon from '../assets/icons/home.svg'
import EditIcon from '../assets/icons/edit.svg'
import ShareIcon from '../assets/icons/share.svg'

export interface WorkspaceListProps {
  data: Workspace[]
  onWorkspaceOpen: (workspace: Workspace) => void
  onWorkspaceEdit: (workspace: Workspace) => void
  onWorkspaceShare: (workspace: Workspace) => void
  onWorkspaceDelete: (workspace: Workspace) => void
}

export const WorkspaceList = function (props: WorkspaceListProps) {
  const onOpenClick = (ev: React.MouseEvent, ws: Workspace) => {
    ev.stopPropagation()
    props.onWorkspaceOpen(ws)
  }

  const onEditClick = (ev: React.MouseEvent, ws: Workspace) => {
    ev.stopPropagation()
    props.onWorkspaceEdit(ws)
  }

  const onShareClick = (ev: React.MouseEvent, ws: Workspace) => {
    ev.stopPropagation()
    props.onWorkspaceShare(ws)
  }

  const onDeleteClick = (ev: React.MouseEvent, ws: Workspace) => {
    ev.stopPropagation()
    props.onWorkspaceDelete(ws)
  }

  return (
        <div className="save-sessions-list">
            {props.data.length === 0 && <p>No sessions saved yet</p>}

            {props.data.map((workspace: Workspace) =>
                <div className="save-sessions-item" onClick={(ev) => { onOpenClick(ev, workspace) }}>
                    <div className="workspace-list-label p-2">
                        {workspace.label}
                    </div>
                    <div className="workspace-list-icon-wrappers">
                        {workspace.openOnLoad &&
                            <div className="workspace-list-icon-wrapper">
                                <Icon className="workspace-list-icon" title="Loads at Startup" icon={DefaultIcon} />
                            </div>
                        }
                        {/* remove share icon for now */}
                        {/* <div className="workspace-list-icon-wrapper workspace-list-icon-wrapper-clickable"
                            onClick={(ev) => { onShareClick(ev, workspace); }}>
                            <Icon className="workspace-list-icon" title="Share Session" icon={ShareIcon} />
                        </div> */}
                        <div className="workspace-list-icon-wrapper workspace-list-icon-wrapper-clickable"
                            onClick={(ev) => { onEditClick(ev, workspace) }}>
                            <Icon className="workspace-list-icon" title="Edit" icon={EditIcon} />
                        </div>
                        <div className="workspace-list-icon-wrapper workspace-list-icon-wrapper-clickable"
                            onClick={(ev) => { onDeleteClick(ev, workspace) }}>
                            <Icon className="workspace-list-icon" title="Delete Session" icon={DeleteIcon} />
                        </div>
                    </div>
                </div>
            )}

        </div>
  )
}
