/** @jsx jsx */
import { jsx } from 'jimu-core'
import { Button, Modal, ModalHeader, ModalBody, ModalFooter } from 'jimu-ui'
import { type Workspace } from '../models'

export interface WorkspaceDeleteConfirmProps {
  data: Workspace
  onConfirm: () => void
  onClose: () => void
}

/**
 * Modal dialog used to confirm deletion of an existing session.
 */
export const WorkspaceDeleteConfirm = function (props: WorkspaceDeleteConfirmProps) {
  return (
    <Modal isOpen={true}>
      <ModalHeader>Delete Session</ModalHeader>
      <ModalBody>
        <p>Are you sure you want to delete "<strong>{props.data.label}</strong>"?</p>
      </ModalBody>
      <ModalFooter>
        <Button onClick={props.onClose}>
          Cancel
        </Button>
        <Button
          type="primary"
          onClick={props.onConfirm}
        >
          Delete
        </Button>
      </ModalFooter>
    </Modal>
  )
}
