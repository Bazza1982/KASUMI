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

beforeEach(() => {
  useWordoAccessStore.setState(useWordoAccessStore.getInitialState())
})

describe('WordoRibbon', () => {
  it('renders without crashing', () => {
    render(<WordoRibbon {...defaultProps} />)
    expect(screen.getByText(/Save As \.docx/i)).toBeDefined()
  })

  it('does not render legacy mode buttons', () => {
    render(<WordoRibbon {...defaultProps} />)
    expect(screen.queryByText(/Data Entry/i)).toBeNull()
    expect(screen.queryByText(/Analyst/i)).toBeNull()
    expect(screen.queryByText(/Admin/i)).toBeNull()
    expect(screen.queryByText(/^MODE$/i)).toBeNull()
  })

  it('export button is enabled by default', () => {
    render(<WordoRibbon {...defaultProps} />)
    const exportBtn = screen.queryAllByRole('button').find(b =>
      b.textContent?.includes('Save As .docx')
    ) as HTMLButtonElement | undefined
    expect(exportBtn?.disabled).toBe(false)
  })

  it('import button is enabled by default', () => {
    render(<WordoRibbon {...defaultProps} />)
    const importBtn = screen.queryAllByRole('button').find(b =>
      b.textContent?.includes('Open .docx')
    ) as HTMLButtonElement | undefined
    expect(importBtn?.disabled).toBe(false)
  })

  it('export callback fires when button clicked', () => {
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
