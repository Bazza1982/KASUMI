import React, { useState, useEffect } from 'react'
import Ribbon from './components/Ribbon'
import { useRealtime } from './services/useRealtime'
import FormulaBar from './components/FormulaBar'
import SheetTabs from './components/SheetTabs'
import StatusBar from './components/StatusBar'
import VirtualGrid from './grid/VirtualGrid'
import ShortcutsHelp from './components/ShortcutsHelp'
import { ErrorBoundary } from './components/ErrorBoundary'

const ExcelShellRoute = () => {
  const [showHelp, setShowHelp] = useState(false)

  // Read localStorage settings for realtime
  const useMock = localStorage.getItem('kasumi_use_mock') !== 'false'
  const baseUrl = localStorage.getItem('kasumi_baserow_url') || 'http://localhost:8000'
  const token = localStorage.getItem('kasumi_baserow_token') || ''

  useRealtime({
    baseUrl,
    token,
    enabled: !useMock && !!token,
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        setShowHelp(h => !h)
      }
      if (e.key === 'Escape' && showHelp) {
        setShowHelp(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showHelp])

  const NEXCEL_MENUS = ['File', 'Home', 'Insert', 'Page Layout', 'Formulas', 'Data', 'Review', 'View', 'Help']
  const [activeMenu, setActiveMenu] = useState('Home')

  return (
    <ErrorBoundary>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#f3f2f1' }}>
        {/* Classic menu bar */}
        <div style={{
          display: 'flex', alignItems: 'center',
          background: '#fff', borderBottom: '1px solid #e1dfdd',
          padding: '0 8px', height: 28, flexShrink: 0, userSelect: 'none',
        }}>
          {NEXCEL_MENUS.map(m => (
            <button
              key={m}
              onClick={() => setActiveMenu(m)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '0 10px', height: '100%', fontSize: 13,
                color: activeMenu === m ? '#217346' : '#333',
                fontWeight: activeMenu === m ? 600 : 400,
                borderBottom: activeMenu === m ? '2px solid #217346' : '2px solid transparent',
              }}
            >{m}</button>
          ))}
        </div>
        <Ribbon onHelp={() => setShowHelp(true)} />
        <FormulaBar />
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <VirtualGrid />
        </div>
        <SheetTabs />
        <StatusBar />
        {showHelp && <ShortcutsHelp onClose={() => setShowHelp(false)} />}
      </div>
    </ErrorBoundary>
  )
}

export default ExcelShellRoute
