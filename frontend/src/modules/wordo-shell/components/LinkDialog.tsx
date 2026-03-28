import React, { useState } from 'react'

interface Props {
  onConfirm: (url: string, text: string) => void
  onCancel: () => void
}

export const LinkDialog: React.FC<Props> = ({ onConfirm, onCancel }) => {
  const [url, setUrl] = useState('https://')
  const [text, setText] = useState('')
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: 24, minWidth: 360, boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>Insert Link</h3>
        <label style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>
          URL
          <input value={url} onChange={e => setUrl(e.target.value)} autoFocus
            style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 8px', border: '1px solid #d0d7de', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }} />
        </label>
        <label style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
          Display Text (optional)
          <input value={text} onChange={e => setText(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 8px', border: '1px solid #d0d7de', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }} />
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '6px 14px', border: '1px solid #d0d7de', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button onClick={() => url && onConfirm(url, text)} style={{ padding: '6px 14px', border: 'none', borderRadius: 4, background: '#7c3aed', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Insert</button>
        </div>
      </div>
    </div>
  )
}
