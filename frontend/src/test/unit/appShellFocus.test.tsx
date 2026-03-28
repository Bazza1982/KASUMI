import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import App from '../../App'

const excelSpy = vi.fn()
const wordoSpy = vi.fn()

vi.mock('../../modules/excel-shell/ExcelShellRoute', () => ({
  default: ({ autoFocusTarget, onSurfaceActivity }: { autoFocusTarget?: 'grid' | 'formula-bar'; onSurfaceActivity?: (target: 'grid' | 'formula-bar') => void }) => {
    excelSpy(autoFocusTarget)
    return (
      <div>
        <div data-testid="excel-autofocus">{autoFocusTarget}</div>
        <button onClick={() => onSurfaceActivity?.('formula-bar')}>Excel Focus Formula</button>
      </div>
    )
  },
}))

vi.mock('../../modules/wordo-shell/WordoShellRoute', () => ({
  default: ({ autoFocusSectionId, onSurfaceActivity }: { autoFocusSectionId?: string | null; onSurfaceActivity?: (sectionId: string) => void }) => {
    wordoSpy(autoFocusSectionId)
    return (
      <div>
        <div data-testid="wordo-autofocus">{autoFocusSectionId ?? 'first-section'}</div>
        <button onClick={() => onSurfaceActivity?.('sec-2')}>Wordo Focus Sec2</button>
      </div>
    )
  },
}))

describe('App shell focus session', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    excelSpy.mockClear()
    wordoSpy.mockClear()
  })

  it('defaults NEXCEL restore target to grid', () => {
    render(<App />)
    expect(screen.getByTestId('excel-autofocus').textContent).toBe('grid')
  })

  it('restores the last focused NEXCEL target after switching shells', () => {
    render(<App />)

    fireEvent.click(screen.getByText('Excel Focus Formula'))
    fireEvent.click(screen.getByText('WORDO'))
    fireEvent.click(screen.getByText('NEXCEL'))

    expect(screen.getByTestId('excel-autofocus').textContent).toBe('formula-bar')
    expect(excelSpy).toHaveBeenLastCalledWith('formula-bar')
  })

  it('restores the last focused WORDO section after switching shells', () => {
    render(<App />)

    fireEvent.click(screen.getByText('WORDO'))
    fireEvent.click(screen.getByText('Wordo Focus Sec2'))
    fireEvent.click(screen.getByText('NEXCEL'))
    fireEvent.click(screen.getByText('WORDO'))

    expect(screen.getByTestId('wordo-autofocus').textContent).toBe('sec-2')
    expect(wordoSpy).toHaveBeenLastCalledWith('sec-2')
  })
})
