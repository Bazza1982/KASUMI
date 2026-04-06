import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import React from 'react'
import Ribbon from '../../modules/excel-shell/components/Ribbon'
import { useExcelStore } from '../../modules/excel-shell/stores/useExcelStore'
import { useCellFormatStore } from '../../modules/excel-shell/stores/useCellFormatStore'

const noop = () => {}

describe('Ribbon CSV import', () => {
  const promptSpy = vi.spyOn(window, 'prompt')
  const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

  beforeEach(() => {
    useExcelStore.setState({ importFromCsv: vi.fn().mockResolvedValue(undefined) })
    promptSpy.mockReset()
    alertSpy.mockClear()
  })

  afterEach(() => {
    promptSpy.mockReset()
    alertSpy.mockClear()
  })

  it('asks for CSV parsing mode before importing', () => {
    const importSpy = vi.fn().mockResolvedValue(undefined)
    useExcelStore.setState({ importFromCsv: importSpy })
    promptSpy.mockReturnValue('2')

    const { container } = render(<Ribbon onHelp={noop} activeTab="File" />)
    const input = container.querySelector('input[accept=".csv"]') as HTMLInputElement | null
    expect(input).not.toBeNull()

    const file = new File(['Name;Status\nAlpha;Todo\n'], 'fixture.csv', { type: 'text/csv' })
    if (input) {
      fireEvent.change(input, { target: { files: [file] } })
    }

    expect(promptSpy).toHaveBeenCalledOnce()
    expect(importSpy).toHaveBeenCalledWith(file, { mode: 'delimiter', delimiter: ';' })
  })
})

describe('Ribbon formatting controls', () => {
  beforeEach(() => {
    useExcelStore.setState({
      activeCell: { rowIndex: 0, colIndex: 0 },
      hiddenFieldIds: [],
      sheet: {
        tableId: 1,
        tableName: 'Sheet1',
        viewId: 1,
        fields: [{ id: 1, name: 'Name', type: 'text', order: 1, primary: true, readOnly: false }],
        rows: [{ id: 101, order: '1.0', fields: { 1: 'Alpha Beta Gamma Delta' } }],
        totalCount: 1,
        isLoading: false,
        error: null,
      },
    })
    useCellFormatStore.setState({ formats: {} })
  })

  it('toggles Wrap Text from the Home ribbon', () => {
    const formatSpy = vi.fn()
    const { getByTitle, rerender } = render(<Ribbon onHelp={noop} activeTab="Home" onFormatSelection={formatSpy} />)

    fireEvent.click(getByTitle('Wrap Text'))
    expect(formatSpy).toHaveBeenCalledWith({ wrapText: true })

    useCellFormatStore.setState({ formats: { '101:1': { wrapText: true } } })
    rerender(<Ribbon onHelp={noop} activeTab="Home" onFormatSelection={formatSpy} />)

    fireEvent.click(getByTitle('Unwrap'))
    expect(formatSpy).toHaveBeenCalledWith({ wrapText: false })
  })
})
