// Page settings panel — paper size, margins, orientation, watermark
import React, { useState } from 'react'
import { useWordoStore } from '../stores/useWordoStore'
import type { PageStyle, WatermarkConfig } from '../types/document'

const inp: React.CSSProperties = {
  border: '1px solid #ccc', borderRadius: 3, padding: '2px 6px',
  fontSize: 12, width: 60, textAlign: 'right',
}
const label: React.CSSProperties = { fontSize: 12, color: '#444', display: 'flex', alignItems: 'center', gap: 6 }
const section: React.CSSProperties = { marginBottom: 16 }
const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }

interface Props {
  onClose: () => void
}

export const PageSettingsPanel: React.FC<Props> = ({ onClose }) => {
  const { document: doc, focusedSectionId, updateSectionPageStyle, updateSectionWatermark } = useWordoStore()

  const targetSection = doc.sections.find(s => s.id === focusedSectionId) ?? doc.sections[0]
  const ps = targetSection.pageStyle
  const wm = targetSection.watermark ?? { text: '', opacity: 0.15, angle: -45, enabled: false }

  const [localPs, setLocalPs] = useState<PageStyle>({ ...ps })
  const [localWm, setLocalWm] = useState<WatermarkConfig>({ ...wm })

  const apply = () => {
    if (!focusedSectionId && doc.sections.length > 0) return
    const sid = focusedSectionId ?? doc.sections[0].id
    updateSectionPageStyle(sid, localPs)
    updateSectionWatermark(sid, localWm)
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', top: 60, right: 16, zIndex: 1000,
      width: 280, background: '#fff', border: '1px solid #ccc',
      borderRadius: 6, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      padding: 16, fontSize: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>Page Settings</span>
        <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, color: '#999' }}>✕</button>
      </div>

      {/* Paper & orientation */}
      <div style={section}>
        <div style={sectionTitle}>Paper</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <label style={label}>
            Size
            <select
              value={localPs.size}
              onChange={e => setLocalPs(p => ({ ...p, size: e.target.value as PageStyle['size'] }))}
              style={{ border: '1px solid #ccc', borderRadius: 3, fontSize: 12, padding: '2px 4px' }}
            >
              {['A4', 'A3', 'Letter', 'Legal'].map(s => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label style={label}>
            <input
              type="radio" name="orient" value="portrait"
              checked={localPs.orientation === 'portrait'}
              onChange={() => setLocalPs(p => ({ ...p, orientation: 'portrait' }))}
            /> Portrait
          </label>
          <label style={label}>
            <input
              type="radio" name="orient" value="landscape"
              checked={localPs.orientation === 'landscape'}
              onChange={() => setLocalPs(p => ({ ...p, orientation: 'landscape' }))}
            /> Land.
          </label>
        </div>
      </div>

      {/* Margins */}
      <div style={section}>
        <div style={sectionTitle}>Margins (mm)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {(['top', 'bottom', 'left', 'right'] as const).map(side => (
            <label key={side} style={label}>
              {side.charAt(0).toUpperCase() + side.slice(1)}
              <input
                type="number" style={inp} min={5} max={60}
                value={localPs.margins[side]}
                onChange={e => setLocalPs(p => ({ ...p, margins: { ...p.margins, [side]: Number(e.target.value) } }))}
              />
            </label>
          ))}
        </div>
      </div>

      <div style={section}>
        <div style={sectionTitle}>Header / Footer</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={label}>
            <input
              type="checkbox"
              checked={localPs.differentFirstPage}
              onChange={e => setLocalPs(p => ({ ...p, differentFirstPage: e.target.checked }))}
            />
            Different first page
          </label>
          <label style={label}>
            <input
              type="checkbox"
              checked={localPs.differentOddEven}
              onChange={e => setLocalPs(p => ({ ...p, differentOddEven: e.target.checked }))}
            />
            Different odd/even pages
          </label>
        </div>
      </div>

      {/* Watermark */}
      <div style={section}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={sectionTitle}>Watermark</span>
          <label style={{ ...label, marginLeft: 'auto' }}>
            <input type="checkbox" checked={localWm.enabled} onChange={e => setLocalWm(w => ({ ...w, enabled: e.target.checked }))} />
            Enable
          </label>
        </div>
        {localWm.enabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={label}>
              Text
              <input
                value={localWm.text ?? ''}
                onChange={e => setLocalWm(w => ({ ...w, text: e.target.value }))}
                placeholder="e.g. DRAFT"
                style={{ border: '1px solid #ccc', borderRadius: 3, padding: '2px 6px', fontSize: 12, flex: 1 }}
              />
            </label>
            <label style={label}>
              Opacity
              <input type="range" min={0.05} max={0.5} step={0.05} value={localWm.opacity}
                onChange={e => setLocalWm(w => ({ ...w, opacity: Number(e.target.value) }))}
                style={{ flex: 1 }}
              />
              <span style={{ width: 32, textAlign: 'right' }}>{Math.round(localWm.opacity * 100)}%</span>
            </label>
            <label style={label}>
              Angle
              <input type="range" min={-90} max={0} step={5} value={localWm.angle}
                onChange={e => setLocalWm(w => ({ ...w, angle: Number(e.target.value) }))}
                style={{ flex: 1 }}
              />
              <span style={{ width: 32, textAlign: 'right' }}>{localWm.angle}°</span>
            </label>
          </div>
        )}
      </div>

      <button
        onClick={apply}
        style={{ width: '100%', padding: '6px 0', background: '#4f8ef7', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
      >
        Apply
      </button>
    </div>
  )
}
