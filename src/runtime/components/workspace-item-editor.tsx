/* eslint-disable no-prototype-builtins */
/** @jsx jsx */
import { jsx } from 'jimu-core'
import { useState } from 'react'
import { Button, Modal, ModalHeader, ModalBody, ModalFooter, TextInput } from 'jimu-ui'
import { type Workspace } from '../models'

export interface WorkspaceItemEditorProps {
  /** Pass an existing workspace to edit, or one with id='' for a new session. */
  data: Workspace
  onSave: (workspace: Workspace) => void
  onClose: () => void
}

/**
 * Modal dialog used for both creating a new session and editing the label
 * of an existing one. Only the session name is editable here — the map
 * state (extent, layers, basemap) is captured automatically by the
 * workspace-manager at save time.
 */
export const WorkspaceItemEditor = function (props: WorkspaceItemEditorProps) {
  const [label, setLabel] = useState<string>(props.data.label)

  const isNew = !props.data.id

  const onTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLabel(e.target.value)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && label.trim()) {
      onSaveClick()
    }
  }

  const onSaveClick = () => {
    if (!label.trim()) return
    const ws: Workspace = {
      ...props.data,
      label: label.trim()
    }
    props.onSave(ws)
  }

  return (
    <Modal isOpen={true}>
      <ModalHeader>{isNew ? 'Save Current Session' : 'Edit Session'}</ModalHeader>
      <ModalBody>
        <div>
          <label className="w-75">Name
            <TextInput
              className="w-100"
              value={label}
              onChange={onTextChange}
              onKeyDown={onKeyDown}
              type="text"
              size="lg"
              placeholder="Enter session name…"
            />
          </label>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button onClick={() => props.onClose()}>
          Cancel
        </Button>
        {' '}
        <Button type="primary" onClick={() => onSaveClick()} disabled={!label.trim()}>
          {isNew ? 'Save' : 'Update'}
        </Button>
      </ModalFooter>
    </Modal>
  )
}