import React, { useEffect } from 'react'
import { useCellChangeStore } from '../stores/useCellChangeStore'

interface CellHistoryPanelProps {
  cellRef: string
  onClose: () => void
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '(empty)'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

const SOURCE_LABEL: Record<string, string> = {
  user_edit: 'Edit',
  paste: 'Paste',
  fill: 'Fill',
  import: 'Import',
}

const CellHistoryPanel: React.FC<CellHistoryPanelProps> = ({ cellRef, onClose }) => {
  const { getChangesForCell } = useCellChangeStore()
  const changes = getChangesForCell(cellRef)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.3)',
        zIndex: 5000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          border: '1px solid #e1dfdd',
          borderRadius: 6,
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          minWidth: 400,
          maxWidth: 560,
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid #e1dfdd',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Cell History — {cellRef}</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#666', lineHeight: 1 }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
          {changes.length === 0 ? (
            <div style={{ padding: '16px', color: '#999', fontSize: 13, textAlign: 'center' }}>
              No history for this cell.
            </div>
          ) : (
            changes.map(c => (
              <div
                key={c.id}
                style={{
                  padding: '8px 16px',
                  borderBottom: '1px solid #f3f2f1',
                  fontSize: 13,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{
                    backgroundColor: '#f3f2f1',
                    borderRadius: 3,
                    padding: '1px 6px',
                    fontSize: 11,
                    color: '#555',
                  }}>
                    {SOURCE_LABEL[c.source] ?? c.source}
                  </span>
                  <span style={{ color: '#999', fontSize: 11 }}>
                    {new Date(c.timestamp).toLocaleString()}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#333' }}>
                  <span style={{ color: '#c00', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {formatValue(c.oldValue)}
                  </span>
                  <span style={{ color: '#888' }}>→</span>
                  <span style={{ color: '#006000', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {formatValue(c.newValue)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default CellHistoryPanel
