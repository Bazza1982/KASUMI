import React, { useState } from 'react'
import { X, Server, Check, AlertCircle } from 'lucide-react'

interface Props {
  onClose: () => void
}

const ConnectionPanel: React.FC<Props> = ({ onClose }) => {
  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem('kasumi_baserow_url') || 'http://localhost:8000')
  const [token, setToken] = useState(() => localStorage.getItem('kasumi_baserow_token') || '')
  const [dbId, setDbId] = useState(() => localStorage.getItem('kasumi_baserow_db_id') || '1')
  const [status, setStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [useMock, setUseMock] = useState(() => localStorage.getItem('kasumi_use_mock') !== 'false')

  const testConnection = async () => {
    setStatus('testing')
    setErrorMsg('')
    try {
      const res = await fetch(`${baseUrl}/api/user/`, {
        headers: { 'Authorization': `Token ${token}` }
      })
      if (res.ok) {
        setStatus('ok')
      } else {
        const text = await res.text()
        setStatus('error')
        setErrorMsg(`HTTP ${res.status}: ${text.slice(0, 100)}`)
      }
    } catch (e) {
      setStatus('error')
      setErrorMsg(String(e))
    }
  }

  const save = () => {
    localStorage.setItem('kasumi_baserow_url', baseUrl)
    localStorage.setItem('kasumi_baserow_token', token)
    localStorage.setItem('kasumi_baserow_db_id', dbId)
    localStorage.setItem('kasumi_use_mock', useMock ? 'true' : 'false')
    onClose()
    window.location.reload() // Reload to pick up new adapter
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000,
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: 8, padding: 24, width: 440,
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Server size={18} color="#217346" />
            <h2 style={{ margin: 0, fontSize: 16, color: '#333' }}>Baserow Connection</h2>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#666' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={useMock} onChange={e => setUseMock(e.target.checked)} />
            <span style={{ fontSize: 14 }}>Use mock data (offline demo mode)</span>
          </label>
        </div>

        <div style={{ opacity: useMock ? 0.4 : 1, pointerEvents: useMock ? 'none' : 'auto' }}>
          {[
            { label: 'Server URL', value: baseUrl, onChange: setBaseUrl, placeholder: 'http://localhost:8000', type: undefined },
            { label: 'API Token', value: token, onChange: setToken, placeholder: 'your-api-token', type: 'password' as const },
            { label: 'Database ID', value: dbId, onChange: setDbId, placeholder: '1', type: 'number' as const },
          ].map(({ label, value, onChange, placeholder, type }) => (
            <div key={label} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{label}</div>
              <input
                type={type || 'text'}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                style={{
                  width: '100%', padding: '8px 10px', border: '1px solid #e1dfdd',
                  borderRadius: 4, fontSize: 13, boxSizing: 'border-box',
                  fontFamily: type === 'password' ? 'monospace' : 'inherit',
                }}
              />
            </div>
          ))}

          <button
            onClick={testConnection}
            disabled={status === 'testing'}
            style={{
              padding: '6px 12px', border: '1px solid #217346', borderRadius: 4,
              backgroundColor: 'transparent', color: '#217346', cursor: 'pointer',
              fontSize: 13, marginBottom: 8,
            }}
          >
            {status === 'testing' ? 'Testing...' : 'Test Connection'}
          </button>
          {status === 'ok' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#217346', fontSize: 12, marginBottom: 8 }}>
              <Check size={14} /> Connected successfully
            </div>
          )}
          {status === 'error' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#c00', fontSize: 12, marginBottom: 8, flexWrap: 'wrap' }}>
              <AlertCircle size={14} /> {errorMsg}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #e1dfdd', borderRadius: 4, backgroundColor: 'transparent', cursor: 'pointer', fontSize: 13 }}>
            Cancel
          </button>
          <button onClick={save} style={{ padding: '8px 16px', border: 'none', borderRadius: 4, backgroundColor: '#217346', color: 'white', cursor: 'pointer', fontSize: 13 }}>
            Save & Reload
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConnectionPanel
