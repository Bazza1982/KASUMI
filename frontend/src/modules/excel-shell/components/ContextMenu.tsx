import React, { useEffect } from 'react'
import { useExcelStore } from '../stores/useExcelStore'
import { useCommentStore } from '../stores/useCommentStore'
import { useCellFormatStore } from '../stores/useCellFormatStore'
import { NexcelLogger } from '../services/logger'

export interface ContextMenuProps {
  x: number
  y: number
  type: 'cell' | 'row' | 'column'
  target: { rowId?: number; fieldId?: number; rowIndex?: number; colIndex?: number }
  onClose: () => void
}

interface MenuItem {
  label: string
  action?: () => void
  shortcut?: string
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, type, target, onClose }) => {
  const { insertRowAt, deleteSelectedRows, toggleSort, toggleHideColumn } = useExcelStore()
  const { addComment } = useCommentStore()
  const { clearFormat } = useCellFormatStore()

  useEffect(() => {
    NexcelLogger.contextMenu('debug', 'open', { type, target })

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleClick = () => onClose()
    window.addEventListener('keydown', handleKey)
    window.addEventListener('click', handleClick)
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('click', handleClick)
    }
  }, [onClose, type, target])

  const cellRef = target.rowId !== undefined && target.fieldId !== undefined
    ? `${target.rowId}:${target.fieldId}`
    : target.rowId !== undefined
    ? `row:${target.rowId}`
    : target.fieldId !== undefined
    ? `col:${target.fieldId}`
    : ''

  const handleAddComment = () => {
    const text = window.prompt('Add comment:')
    if (text && text.trim()) {
      addComment(cellRef, text.trim())
      NexcelLogger.contextMenu('info', 'addComment', { cellRef })
    }
    onClose()
  }

  const items: Array<MenuItem | 'separator'> = (() => {
    if (type === 'cell') {
      return [
        { label: 'Insert Row Above', action: () => { if (target.rowIndex !== undefined) insertRowAt(target.rowIndex); onClose() } },
        { label: 'Insert Row Below', action: () => { if (target.rowIndex !== undefined) insertRowAt(target.rowIndex + 1); onClose() } },
        { label: 'Delete Row', action: () => { deleteSelectedRows(); onClose() } },
        'separator',
        { label: 'Copy', shortcut: 'Ctrl+C', action: () => onClose() },
        { label: 'Paste', shortcut: 'Ctrl+V', action: () => onClose() },
        'separator',
        { label: 'Add Comment', action: handleAddComment },
        { label: 'View Comments', action: () => onClose() },
        'separator',
        { label: 'Clear Formatting', action: () => { if (cellRef) clearFormat(cellRef); onClose() } },
      ]
    }
    if (type === 'row') {
      return [
        { label: 'Insert Row Above', action: () => { if (target.rowIndex !== undefined) insertRowAt(target.rowIndex); onClose() } },
        { label: 'Insert Row Below', action: () => { if (target.rowIndex !== undefined) insertRowAt(target.rowIndex + 1); onClose() } },
        { label: 'Delete Row', action: () => { deleteSelectedRows(); onClose() } },
        'separator',
        { label: 'Add Row Comment', action: handleAddComment },
      ]
    }
    // column
    return [
      { label: 'Sort Ascending', action: () => { if (target.colIndex !== undefined) toggleSort(target.colIndex); onClose() } },
      { label: 'Sort Descending', action: () => { if (target.colIndex !== undefined) { toggleSort(target.colIndex); toggleSort(target.colIndex) } onClose() } },
      'separator',
      { label: 'Hide Column', action: () => { if (target.fieldId !== undefined) toggleHideColumn(target.fieldId); onClose() } },
      { label: 'Add Column Comment', action: handleAddComment },
    ]
  })()

  return (
    <div
      style={{
        position: 'fixed',
        top: y,
        left: x,
        backgroundColor: 'white',
        border: '1px solid #e1dfdd',
        borderRadius: 4,
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        zIndex: 4000,
        minWidth: 190,
        padding: '4px 0',
      }}
      onClick={e => e.stopPropagation()}
    >
      {items.map((item, i) =>
        item === 'separator' ? (
          <div key={i} style={{ height: 1, backgroundColor: '#e1dfdd', margin: '2px 0' }} />
        ) : (
          <div
            key={i}
            onClick={item.action}
            style={{
              padding: '6px 16px',
              cursor: 'pointer',
              fontSize: '13px',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 24,
              color: '#222',
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f3f2f1')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <span>{item.label}</span>
            {item.shortcut && <span style={{ color: '#999', fontSize: '11px' }}>{item.shortcut}</span>}
          </div>
        )
      )}
    </div>
  )
}

export default ContextMenu
