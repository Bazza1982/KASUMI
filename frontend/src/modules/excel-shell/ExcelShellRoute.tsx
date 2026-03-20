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

  return (
    <ErrorBoundary>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#f3f2f1' }}>
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
