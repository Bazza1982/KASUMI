import React from 'react'
import { useAccessStore, type AccessMode } from '../stores/useAccessStore'
import { Shield, Eye, Edit3 } from 'lucide-react'

const MODE_CONFIG: Record<AccessMode, { label: string; icon: React.ReactNode; color: string; description: string }> = {
  'data-entry': {
    label: 'Data Entry',
    icon: <Edit3 size={12} />,
    color: '#2196f3',
    description: 'Edit cells and add rows only',
  },
  'analyst': {
    label: 'Analyst',
    icon: <Eye size={12} />,
    color: '#4caf50',
    description: 'Full edit + import/export + view management',
  },
  'admin': {
    label: 'Admin',
    icon: <Shield size={12} />,
    color: '#f44336',
    description: 'Full access including schema changes',
  },
}

export function AccessModeSelector() {
  const { mode, setMode } = useAccessStore()
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const current = MODE_CONFIG[mode]

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={`Mode: ${current.description}`}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', fontSize: 11, fontWeight: 600,
          border: `1px solid ${current.color}`,
          borderRadius: 3, cursor: 'pointer',
          color: current.color, background: 'white',
        }}
      >
        {current.icon}
        {current.label}
        <span style={{ fontSize: 9, marginLeft: 2 }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, zIndex: 1000,
          background: 'white', border: '1px solid #ddd', borderRadius: 4,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: 220, marginTop: 2,
        }}>
          {(Object.entries(MODE_CONFIG) as [AccessMode, typeof current][]).map(([m, cfg]) => (
            <button
              key={m}
              onClick={() => { setMode(m); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                width: '100%', padding: '8px 12px', border: 'none',
                background: mode === m ? '#f0f7ff' : 'white',
                cursor: 'pointer', textAlign: 'left',
                borderLeft: mode === m ? `3px solid ${cfg.color}` : '3px solid transparent',
              }}
            >
              <span style={{ color: cfg.color, marginTop: 2 }}>{cfg.icon}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>{cfg.label}</div>
                <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>{cfg.description}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
