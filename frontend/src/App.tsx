import React, { useState, useEffect } from 'react'
import ExcelShellRoute from './modules/excel-shell/ExcelShellRoute'
import WordoShellRoute from './modules/wordo-shell/WordoShellRoute'
import type { KasumiShell } from './platform/types'
import './index.css'

const SHELL_KEY = 'kasumi_active_shell'
const SPLASH_KEY = 'kasumi_splash_seen'

function App() {
  const saved = (typeof localStorage !== 'undefined' ? localStorage.getItem(SHELL_KEY) : null) as KasumiShell | null
  const [shell, setShell] = useState<KasumiShell>(saved ?? 'nexcel')

  // Show splash only on the very first load per session
  const [showSplash, setShowSplash] = useState(() =>
    typeof sessionStorage !== 'undefined' && !sessionStorage.getItem(SPLASH_KEY)
  )

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

  const btnClass = (s: KasumiShell) =>
    shell === s
      ? `kasumi-switcher__btn kasumi-switcher__btn--${s}`
      : 'kasumi-switcher__btn kasumi-switcher__btn--inactive'

  return (
    <div className="app" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

      {/* Splash screen — first load per session only */}
      {showSplash && (
        <div className="kasumi-splash">
          <div className="kasumi-splash__logo">
            KA<span>SU</span>MI
          </div>
          <div className="kasumi-splash__bar" />
          <div className="kasumi-splash__sub">Intelligent Workspace Platform</div>
        </div>
      )}

      {/* Shell Switcher — top-left, persistent */}
      <div className="kasumi-switcher">
        <div className="kasumi-switcher__wordmark">
          KA<em>SU</em>MI
        </div>
        {(['nexcel', 'wordo'] as KasumiShell[]).map(s => (
          <button
            key={s}
            className={btnClass(s)}
            onClick={() => switchShell(s)}
          >
            {s === 'nexcel' ? 'NEXCEL' : 'WORDO'}
          </button>
        ))}
      </div>

      {/* Active shell */}
      {shell === 'nexcel' && <ExcelShellRoute />}
      {shell === 'wordo' && <WordoShellRoute />}
    </div>
  )
}

export default App
