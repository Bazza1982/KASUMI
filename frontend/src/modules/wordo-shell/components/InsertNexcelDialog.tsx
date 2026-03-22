// Dialog for inserting a Nexcel table embed into the document
import React, { useEffect, useState } from 'react'
import { objectRegistry } from '../../../platform/object-registry'
import type { WorkspaceObjectRef } from '../../../platform/types'

interface Props {
  onInsert: (objectId: string, mode: 'linked' | 'snapshot', caption: string) => void
  onClose: () => void
}

export const InsertNexcelDialog: React.FC<Props> = ({ onInsert, onClose }) => {
  const [nexcelObjects, setNexcelObjects] = useState<WorkspaceObjectRef[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [mode, setMode] = useState<'linked' | 'snapshot'>('snapshot')
  const [caption, setCaption] = useState('')

  useEffect(() => {
    const objs = objectRegistry.listByShell('nexcel')
    setNexcelObjects(objs)
    if (objs.length > 0) setSelectedId(objs[0].id)
  }, [])

  const handleInsert = () => {
    if (!selectedId) return
    onInsert(selectedId, mode, caption)
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
    }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#fff', borderRadius: 8, padding: 24, width: 380,
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)', fontSize: 13,
      }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Insert Nexcel Table</div>

        {nexcelObjects.length === 0 ? (
          <div style={{ color: '#999', marginBottom: 16, fontSize: 12 }}>
            No Nexcel tables available.<br />
            Switch to NEXCEL shell first to load tables, then come back.
          </div>
        ) : (
          <>
            {/* Table selector */}
            <label style={{ display: 'block', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#666', marginBottom: 4 }}>Select Table</div>
              <select
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                style={{ width: '100%', border: '1px solid #ccc', borderRadius: 4, padding: '5px 8px', fontSize: 13 }}
              >
                {nexcelObjects.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </label>

            {/* Embed mode */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#666', marginBottom: 6 }}>Embed Mode</div>
              <div style={{ display: 'flex', gap: 12 }}>
                {(['snapshot', 'linked'] as const).map(m => (
                  <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
                    <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
                    <div>
                      <div style={{ fontWeight: 600 }}>{m === 'snapshot' ? 'Snapshot' : 'Live Link'}</div>
                      <div style={{ color: '#999', fontSize: 10 }}>
                        {m === 'snapshot' ? 'Frozen copy at insert time' : 'Refreshes from Nexcel'}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Caption */}
        <label style={{ display: 'block', marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#666', marginBottom: 4 }}>Caption (optional)</div>
          <input
            value={caption}
            onChange={e => setCaption(e.target.value)}
            placeholder="Table 1: …"
            style={{ width: '100%', border: '1px solid #ccc', borderRadius: 4, padding: '5px 8px', fontSize: 13, boxSizing: 'border-box' }}
          />
        </label>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '6px 16px', border: '1px solid #ccc', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 13 }}
          >
            Cancel
          </button>
          <button
            onClick={handleInsert}
            disabled={!selectedId}
            style={{ padding: '6px 16px', border: 'none', borderRadius: 4, background: selectedId ? '#4f8ef7' : '#ccc', color: '#fff', cursor: selectedId ? 'pointer' : 'not-allowed', fontWeight: 600, fontSize: 13 }}
          >
            Insert
          </button>
        </div>
      </div>
    </div>
  )
}
