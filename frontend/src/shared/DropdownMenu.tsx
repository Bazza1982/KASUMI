/**
 * DropdownMenu — shared classic menu-bar dropdown used by Nexcel and WORDO.
 *
 * Usage:
 *   <DropdownMenu label="File" items={fileMenuItems} accentColor="#217346" />
 *
 * MenuItem types:
 *   { label, shortcut?, action }         — clickable item
 *   { label: '---' }                     — separator
 *   { label, submenu: MenuItem[] }       — submenu (opens on hover)
 *   { label, disabled?: true, action? }  — greyed-out item
 */
import React, { useState, useRef, useEffect, useCallback } from 'react'

export interface MenuItem {
  label: string            // '---' renders a separator
  shortcut?: string        // e.g. 'Ctrl+C'
  action?: () => void
  disabled?: boolean
  submenu?: MenuItem[]
}

interface DropdownMenuProps {
  label: string
  items: MenuItem[]
  accentColor?: string     // highlight color, default '#217346' (Nexcel green)
  isOpen?: boolean
  onOpen?: () => void
  onClose?: () => void
}

// ── Sub-menu panel ────────────────────────────────────────────────────────────
const SubMenu: React.FC<{ items: MenuItem[]; accentColor: string }> = ({ items, accentColor }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  return (
    <div style={styles.panel}>
      {items.map((item, i) => {
        if (item.label === '---') return <div key={i} style={styles.separator} />
        const isDisabled = item.disabled || (!item.action && !item.submenu)
        return (
          <div
            key={i}
            style={{
              ...styles.item,
              color: isDisabled ? '#aaa' : '#222',
              background: hoveredIdx === i && !isDisabled ? accentColor + '18' : 'transparent',
              cursor: isDisabled ? 'default' : 'pointer',
              position: 'relative',
            }}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
            onClick={(e) => {
              if (!isDisabled && item.action) {
                e.stopPropagation()
                item.action()
              }
            }}
          >
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.shortcut && <span style={styles.shortcut}>{item.shortcut}</span>}
            {item.submenu && <span style={{ marginLeft: 8, opacity: 0.5 }}>▶</span>}
            {item.submenu && hoveredIdx === i && (
              <div style={{ ...styles.panel, position: 'absolute', left: '100%', top: 0 }}>
                <SubMenu items={item.submenu} accentColor={accentColor} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main DropdownMenu ─────────────────────────────────────────────────────────
const DropdownMenu: React.FC<DropdownMenuProps> = ({
  label,
  items,
  accentColor = '#217346',
  isOpen = false,
  onOpen,
  onClose,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose?.()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen, onClose])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  const handleItemClick = useCallback((item: MenuItem) => {
    if (item.disabled || (!item.action && !item.submenu)) return
    if (item.action) {
      item.action()
      onClose?.()
    }
  }, [onClose])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Menu button */}
      <button
        onClick={() => isOpen ? onClose?.() : onOpen?.()}
        style={{
          background: isOpen ? accentColor + '18' : 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0 10px',
          height: 28,
          fontSize: 13,
          color: isOpen ? accentColor : '#333',
          fontWeight: isOpen ? 600 : 400,
          borderBottom: isOpen ? `2px solid ${accentColor}` : '2px solid transparent',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={() => {
          // If another menu is already open, switch to this one
          if (!isOpen && onOpen) onOpen()
        }}
      >
        {label}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div style={styles.panel}>
          {items.map((item, i) => {
            if (item.label === '---') return <div key={i} style={styles.separator} />
            const isDisabled = item.disabled || (!item.action && !item.submenu)
            return (
              <div
                key={i}
                style={{
                  ...styles.item,
                  color: isDisabled ? '#aaa' : '#222',
                  background: hoveredIdx === i && !isDisabled ? accentColor + '18' : 'transparent',
                  cursor: isDisabled ? 'default' : 'pointer',
                  position: 'relative',
                }}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                onClick={() => handleItemClick(item)}
              >
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.shortcut && <span style={styles.shortcut}>{item.shortcut}</span>}
                {item.submenu && <span style={{ marginLeft: 8, opacity: 0.5 }}>▶</span>}
                {item.submenu && hoveredIdx === i && (
                  <div style={{ ...styles.panel, position: 'absolute', left: '100%', top: 0 }}>
                    <SubMenu items={item.submenu} accentColor={accentColor} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const styles = {
  panel: {
    position: 'absolute' as const,
    top: '100%',
    left: 0,
    zIndex: 9999,
    background: '#fff',
    border: '1px solid #d0d0d0',
    borderRadius: 3,
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    minWidth: 220,
    paddingTop: 4,
    paddingBottom: 4,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    padding: '5px 16px 5px 24px',
    fontSize: 13,
    lineHeight: '20px',
    gap: 8,
  },
  separator: {
    height: 1,
    background: '#e1dfdd',
    margin: '4px 0',
  },
  shortcut: {
    color: '#888',
    fontSize: 11,
    whiteSpace: 'nowrap' as const,
  },
}

export default DropdownMenu
