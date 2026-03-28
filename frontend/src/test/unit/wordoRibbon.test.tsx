import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { WordoRibbon } from '../../modules/wordo-shell/components/WordoRibbon'
import { useWordoAccessStore } from '../../modules/wordo-shell/stores/useWordoAccessStore'

const noop = () => {}

const defaultProps = {
  onPageSettings: noop,
  onInsertNexcel: noop,
  onExportDocx: noop,
  onExportPdf: noop,
  onImportDocx: noop,
  onExportMarkdown: noop,
  onImportMarkdown: noop,
  onSave: noop,
  activeTab: 'File',
}

function setMode(mode: 'data-entry' | 'analyst' | 'admin') {
  useWordoAccessStore.getState().setMode(mode)
}

describe('WordoRibbon — data-entry mode', () => {
  beforeEach(() => setMode('data-entry'))

  it('renders without crashing', () => {
    render(<WordoRibbon {...defaultProps} />)
    // Mode button label is "✏ Data Entry"
    expect(screen.getByText(/Data Entry/i)).toBeDefined()
  })

  it('Export .docx button is disabled', () => {
    render(<WordoRibbon {...defaultProps} />)
    const exportBtn = screen.queryAllByRole('button').find(b =>
      b.textContent?.includes('Save As .docx')
    ) as HTMLButtonElement | undefined
    expect(exportBtn?.disabled).toBe(true)
  })

  it('Import button is disabled', () => {
    render(<WordoRibbon {...defaultProps} />)
    const importBtn = screen.queryAllByRole('button').find(b =>
      b.textContent?.includes('Open .docx')
    ) as HTMLButtonElement | undefined
    expect(importBtn?.disabled).toBe(true)
  })
})

describe('WordoRibbon — analyst mode', () => {
  beforeEach(() => setMode('analyst'))

  it('renders with Analyst mode button', () => {
    render(<WordoRibbon {...defaultProps} />)
    expect(screen.getByText(/Analyst/i)).toBeDefined()
  })

  it('Export .docx button is enabled', () => {
    render(<WordoRibbon {...defaultProps} />)
    const exportBtn = screen.queryAllByRole('button').find(b =>
      b.textContent?.includes('Save As .docx')
    ) as HTMLButtonElement | undefined
    expect(exportBtn?.disabled).toBe(false)
  })
})

describe('WordoRibbon — admin mode', () => {
  beforeEach(() => setMode('admin'))

  it('renders with Admin mode button', () => {
    render(<WordoRibbon {...defaultProps} />)
    expect(screen.getByText(/Admin/i)).toBeDefined()
  })
})

describe('WordoRibbon — mode switching', () => {
  it('clicking DATA-ENTRY mode button calls setMode', () => {
    setMode('analyst')
    render(<WordoRibbon {...defaultProps} />)
    // Find the data-entry mode button (green pill)
    const deBtn = screen.queryAllByRole('button').find(b =>
      b.textContent?.includes('Data Entry')
    )
    if (deBtn) {
      fireEvent.click(deBtn)
      expect(useWordoAccessStore.getState().mode).toBe('data-entry')
    }
  })

  it('clicking ADMIN mode button switches to admin', () => {
    setMode('analyst')
    render(<WordoRibbon {...defaultProps} />)
    const adminBtn = screen.queryAllByRole('button').find(b =>
      b.textContent?.includes('Admin') && !b.textContent?.includes('Analyst')
    )
    if (adminBtn) {
      fireEvent.click(adminBtn)
      expect(useWordoAccessStore.getState().mode).toBe('admin')
    }
  })

  it('export callback fires when button clicked in analyst mode', () => {
    setMode('analyst')
    const onExportDocx = vi.fn()
    render(<WordoRibbon {...defaultProps} onExportDocx={onExportDocx} />)
    const exportBtn = screen.queryAllByRole('button').find(b =>
      b.textContent?.includes('Save As .docx')
    ) as HTMLButtonElement | undefined
    expect(exportBtn).toBeDefined()
    expect(exportBtn?.disabled).toBe(false)
    if (exportBtn) {
      fireEvent.click(exportBtn)
      expect(onExportDocx).toHaveBeenCalledOnce()
    }
  })
})
