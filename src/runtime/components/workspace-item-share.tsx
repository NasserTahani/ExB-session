/** @jsx jsx */
import { jsx } from 'jimu-core'
import { useState } from 'react'
import { Button, Modal, ModalHeader, ModalBody, ModalFooter, TextInput } from 'jimu-ui'

export interface WorkspaceItemShareProps {
  onSave: (itemId: string) => void
  onClose: () => void
}

/**
 * Modal dialog used to import a shared session by portal item id.
 */
export const WorkspaceItemShare = function (props: WorkspaceItemShareProps) {
  const [itemId, setItemId] = useState<string>('')
  const trimmedItemId = itemId.trim()

  const onTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setItemId(e.target.value)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && trimmedItemId) {
      props.onSave(trimmedItemId)
    }
  }

  return (
    <Modal isOpen={true}>
      <ModalHeader>Import a Session</ModalHeader>
      <ModalBody>
        <div>
          <label className="w-100">Portal Item ID
            <TextInput
              className="w-100"
              value={itemId}
              onChange={onTextChange}
              onKeyDown={onKeyDown}
              type="text"
              size="lg"
              placeholder="Enter shared portal item id"
            />
          </label>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button onClick={() => props.onClose()}>
          Cancel
        </Button>
        <Button
          type="primary"
          onClick={() => props.onSave(trimmedItemId)}
          disabled={!trimmedItemId}
        >
          Import
        </Button>
      </ModalFooter>
    </Modal>
  )
}
