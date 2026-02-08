/* eslint-disable no-prototype-builtins */
/** @jsx jsx */
import { jsx } from 'jimu-core'
import { useState } from 'react'
import { Button, Modal, ModalHeader, ModalBody, ModalFooter, TextInput, Checkbox } from 'jimu-ui'
import { Workspace } from '../models'

export interface WorkspaceItemEditorProps {
  data: Workspace
  onSave: (workspace: Workspace) => void
  onClose: () => void
}

export const WorkspaceItemEditor = function (props: WorkspaceItemEditorProps) {
  const [label, setLabel] = useState<string>(props.data.label)
  const [loadStartup, setLoadStartup] = useState<boolean>(props.data.openOnLoad)
  const [includeLayers, setIncludeLayers] = useState<boolean>(props.data.includeLayers)
  const [includeExtent, setIncludeExtent] = useState<boolean>(props.data.includeExtent)

  const onTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setLabel(value)
  }

  const onLoadStartupChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const value: boolean = e.target.checked
    setLoadStartup(value)
  }

  const onIncludeExtentChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const value: boolean = e.target.checked
    setIncludeExtent(value)
  }

  const onIncludeLayersChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const value: boolean = e.target.checked
    setIncludeLayers(value)
  }

  const onSaveClick = () => {
    const ws = { ...props.data }
    ws.label = label
    ws.openOnLoad = loadStartup
    ws.includeLayers = includeLayers
    ws.includeExtent = includeExtent
    props.onSave(ws)
  }

  return (
        <Modal isOpen={true}>
            <ModalHeader>Save Current Session</ModalHeader>
            <ModalBody>
                <div>
                    <label className="w-75">Name
                        <TextInput className="w-100" value={label} onChange={onTextChange} type="text" size="lg" />
                    </label>
                </div>
                <div>
                    <Checkbox checked={includeLayers} onChange={onIncludeLayersChange} />
                    <label className="ml-2">Layers</label>
                </div>
                <div>
                    <Checkbox checked={includeExtent} onChange={onIncludeExtentChange} />
                    <label className="ml-2">Map Extent</label>
                </div>
                <div>
                    <Checkbox checked={loadStartup} onChange={onLoadStartupChange} />
                    <label className="ml-2">Load on Startup</label>
                </div>
            </ModalBody>
            <ModalFooter>
                <Button onClick={() => props.onClose()}>
                    Cancel
                </Button>
                {' '}
                <Button type="primary" onClick={() => onSaveClick()}>
                    {props.data.id === null ? 'Save' : 'Update'}
                </Button>
            </ModalFooter>
        </Modal>
  )
}
