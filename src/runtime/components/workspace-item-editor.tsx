/* eslint-disable no-prototype-builtins */
/** @jsx jsx */
import { jsx } from 'jimu-core'
import { useState } from 'react'
import { Button, Modal, ModalHeader, ModalBody, ModalFooter, TextInput } from 'jimu-ui'
import { type Workspace } from '../models'

export type SaveMode = 'save' | 'save-version'

export interface WorkspaceItemEditorProps {
  /** Pass an existing workspace to edit, or one with id='' for a new session. */
  data: Workspace
  onSave: (workspace: Workspace, mode: SaveMode) => void
  onClose: () => void
}

/**
 * Modal dialog used for both creating a new session and editing an existing one.
 *
 * New session:  shows a single "Save" button.
 * Edit session: shows "Save" (overwrite) and "Save a Version" (new copy with timestamp).
 */
export const WorkspaceItemEditor = function (props: WorkspaceItemEditorProps) {
  const [label, setLabel] = useState<string>(props.data.label)

  const isNew = !props.data.id

  const onTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLabel(e.target.value)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && label.trim()) {
      handleSave('save')
    }
  }

  const handleSave = (mode: SaveMode) => {
    if (!label.trim()) return
    const ws: Workspace = {
      ...props.data,
      label: label.trim()
    }
    props.onSave(ws, mode)
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
        {!isNew && (
          <Button
            type="default"
            onClick={() => handleSave('save-version')}
            disabled={!label.trim()}
          >
            Save a Version
          </Button>
        )}
        {' '}
        <Button
          type="primary"
          onClick={() => handleSave('save')}
          disabled={!label.trim()}
        >
          Save
        </Button>
      </ModalFooter>
    </Modal>
  )
}