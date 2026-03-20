import React from 'react'
import { X } from 'lucide-react'

const SHORTCUTS = [
  { category: 'Navigation', items: [
    ['Arrow Keys', 'Move active cell'],
    ['Tab / Shift+Tab', 'Move right / left'],
    ['Enter', 'Move down (or enter edit)'],
    ['Ctrl+Home', 'Go to first cell'],
    ['Ctrl+End', 'Go to last cell'],
    ['Home', 'Go to first column in row'],
    ['End', 'Go to last column in row'],
  ]},
  { category: 'Selection', items: [
    ['Shift+Arrow', 'Extend selection'],
    ['Ctrl+A', 'Select all'],
    ['Shift+Click', 'Select range'],
    ['Click+Drag', 'Select range'],
  ]},
  { category: 'Editing', items: [
    ['F2 / Enter', 'Enter edit mode'],
    ['Escape', 'Cancel edit'],
    ['Delete / Backspace', 'Clear selected cells'],
    ['Any key', 'Start editing (replaces value)'],
  ]},
  { category: 'Clipboard', items: [
    ['Ctrl+C', 'Copy selection'],
    ['Ctrl+V', 'Paste (TSV from Excel)'],
    ['Drag fill handle', 'Fill down / right'],
  ]},
  { category: 'History', items: [
    ['Ctrl+Z', 'Undo'],
    ['Ctrl+Y / Ctrl+Shift+Z', 'Redo'],
  ]},
  { category: 'View', items: [
    ['Click column header', 'Sort by column'],
    ['Right-click column header', 'Column options'],
    ['Right-click cell', 'Row options'],
    ['Ctrl+/', 'Show this help'],
  ]},
]

interface Props { onClose: () => void }

const ShortcutsHelp: React.FC<Props> = ({ onClose }) => (
  <div
    style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}
    onClick={onClose}
  >
    <div
      style={{ backgroundColor: 'white', borderRadius: 8, padding: 24, width: 640, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 16, color: '#217346' }}>⌨️ Keyboard Shortcuts</h2>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#666' }}><X size={18} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {SHORTCUTS.map(group => (
          <div key={group.category}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#217346', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, borderBottom: '1px solid #e1dfdd', paddingBottom: 4 }}>
              {group.category}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {group.items.map(([key, desc]) => (
                  <tr key={key}>
                    <td style={{ padding: '3px 8px 3px 0', verticalAlign: 'top' }}>
                      <kbd style={{ backgroundColor: '#f3f2f1', border: '1px solid #e1dfdd', borderRadius: 3, padding: '1px 5px', fontSize: 11, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {key}
                      </kbd>
                    </td>
                    <td style={{ padding: '3px 0', fontSize: 13, color: '#444', verticalAlign: 'top' }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, padding: '8px 12px', backgroundColor: '#f3f2f1', borderRadius: 4, fontSize: 12, color: '#666' }}>
        💡 Tip: Click column headers to sort. Right-click for options. Drag the green fill handle to fill a range.
      </div>
    </div>
  </div>
)

export default ShortcutsHelp
