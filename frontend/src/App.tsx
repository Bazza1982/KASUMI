import React, { useState, useEffect, useRef } from 'react'
import ExcelShellRoute from './modules/excel-shell/ExcelShellRoute'
import WordoShellRoute from './modules/wordo-shell/WordoShellRoute'
import type { KasumiShell } from './platform/types'
import './index.css'

const SHELL_KEY = 'kasumi_active_shell'
const SPLASH_KEY = 'kasumi_splash_seen'
const POS_KEY = 'kasumi_switcher_pos'
const SURFACE_KEY = 'kasumi_surface_session'

type SurfaceSessionState = {
  nexcel: {
    target: 'grid' | 'formula-bar'
  }
  wordo: {
    sectionId: string | null
  }
}

const DEFAULT_SURFACE_SESSION: SurfaceSessionState = {
  nexcel: { target: 'grid' },
  wordo: { sectionId: null },
}

function App() {
  const saved = (typeof localStorage !== 'undefined' ? localStorage.getItem(SHELL_KEY) : null) as KasumiShell | null
  const [shell, setShell] = useState<KasumiShell>(saved ?? 'nexcel')
  const [surfaceSession, setSurfaceSession] = useState<SurfaceSessionState>(() => {
    if (typeof localStorage === 'undefined') return DEFAULT_SURFACE_SESSION
    try {
      return {
        ...DEFAULT_SURFACE_SESSION,
        ...JSON.parse(localStorage.getItem(SURFACE_KEY) || 'null'),
      }
    } catch {
      return DEFAULT_SURFACE_SESSION
    }
  })

  const [showSplash, setShowSplash] = useState(() =>
    typeof sessionStorage !== 'undefined' && !sessionStorage.getItem(SPLASH_KEY)
  )

  // Draggable position — default bottom-right
  const savedPos = (() => { try { return JSON.parse(localStorage.getItem(POS_KEY) || 'null') } catch { return null } })()
  const [pos, setPos] = useState<{x: number, y: number}>(savedPos ?? { x: window.innerWidth - 200, y: window.innerHeight - 50 })
  const dragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const switcherRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (showSplash) {
      sessionStorage.setItem(SPLASH_KEY, '1')
      const t = setTimeout(() => setShowSplash(false), 1600)
      return () => clearTimeout(t)
    }
  }, [showSplash])

  const switchShell = (s: KasumiShell) => {
    localStorage.setItem(SHELL_KEY, s)
    setShell(s)
  }

  useEffect(() => {
    localStorage.setItem(SURFACE_KEY, JSON.stringify(surfaceSession))
  }, [surfaceSession])

  const onMouseDown = (e: React.MouseEvent) => {
    // Only drag on the wordmark handle, not the buttons
    if ((e.target as HTMLElement).tagName === 'BUTTON') return
    dragging.current = true
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    e.preventDefault()
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const nx = Math.max(0, Math.min(window.innerWidth - 180, e.clientX - dragOffset.current.x))
      const ny = Math.max(0, Math.min(window.innerHeight - 36, e.clientY - dragOffset.current.y))
      setPos({ x: nx, y: ny })
    }
    const onUp = () => {
      if (dragging.current) {
        dragging.current = false
        setPos(p => { localStorage.setItem(POS_KEY, JSON.stringify(p)); return p })
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const btnClass = (s: KasumiShell) =>
    shell === s
      ? `kasumi-switcher__btn kasumi-switcher__btn--${s}`
      : 'kasumi-switcher__btn kasumi-switcher__btn--inactive'

  return (
    <div className="app" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

      {showSplash && (
        <div className="kasumi-splash">
          <div className="kasumi-splash__logo">KA<span>SU</span>MI</div>
          <div className="kasumi-splash__bar" />
          <div className="kasumi-splash__sub">Intelligent Workspace Platform</div>
        </div>
      )}

      {/* Draggable Shell Switcher */}
      <div
        ref={switcherRef}
        className="kasumi-switcher"
        style={{ left: pos.x, top: pos.y }}
        onMouseDown={onMouseDown}
      >
        <div className="kasumi-switcher__wordmark" style={{ cursor: 'grab' }}>
          KA<em>SU</em>MI
        </div>
        {(['nexcel', 'wordo'] as KasumiShell[]).map(s => (
          <button key={s} className={btnClass(s)} onClick={() => switchShell(s)}>
            {s === 'nexcel' ? 'NEXCEL' : 'WORDO'}
          </button>
        ))}
      </div>

      {shell === 'nexcel' && (
        <ExcelShellRoute
          autoFocusTarget={surfaceSession.nexcel.target}
          onSurfaceActivity={(target) => {
            setSurfaceSession(prev => ({
              ...prev,
              nexcel: { target },
            }))
          }}
        />
      )}
      {shell === 'wordo' && (
        <WordoShellRoute
          autoFocusSectionId={surfaceSession.wordo.sectionId}
          onSurfaceActivity={(sectionId) => {
            setSurfaceSession(prev => ({
              ...prev,
              wordo: { sectionId },
            }))
          }}
        />
      )}
    </div>
  )
}

export default App
