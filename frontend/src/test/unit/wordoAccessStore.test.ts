import { describe, it, expect, beforeEach } from 'vitest'
import { useWordoAccessStore } from '../../modules/wordo-shell/stores/useWordoAccessStore'

const reset = (mode: 'data-entry' | 'analyst' | 'admin' = 'analyst') => {
  useWordoAccessStore.setState({ ...useWordoAccessStore.getState(), mode })
  useWordoAccessStore.getState().setMode(mode)
}

describe('useWordoAccessStore — data-entry mode', () => {
  beforeEach(() => reset('data-entry'))

  it('can edit body text', () => expect(useWordoAccessStore.getState().canEditBody).toBe(true))
  it('can fill bindings', () => expect(useWordoAccessStore.getState().canFillBindings).toBe(true))
  it('cannot insert blocks', () => expect(useWordoAccessStore.getState().canInsertBlocks).toBe(false))
  it('cannot delete blocks', () => expect(useWordoAccessStore.getState().canDeleteBlocks).toBe(false))
  it('cannot insert sections', () => expect(useWordoAccessStore.getState().canInsertSections).toBe(false))
  it('cannot edit header/footer', () => expect(useWordoAccessStore.getState().canEditHeaderFooter).toBe(false))
  it('cannot set watermark', () => expect(useWordoAccessStore.getState().canSetWatermark).toBe(false))
  it('cannot set page style', () => expect(useWordoAccessStore.getState().canSetPageStyle).toBe(false))
  it('cannot modify styles', () => expect(useWordoAccessStore.getState().canModifyStyles).toBe(false))
  it('cannot export', () => expect(useWordoAccessStore.getState().canExport).toBe(false))
  it('cannot import', () => expect(useWordoAccessStore.getState().canImport).toBe(false))
})

describe('useWordoAccessStore — analyst mode', () => {
  beforeEach(() => reset('analyst'))

  it('can edit body text', () => expect(useWordoAccessStore.getState().canEditBody).toBe(true))
  it('can insert blocks', () => expect(useWordoAccessStore.getState().canInsertBlocks).toBe(true))
  it('can delete blocks', () => expect(useWordoAccessStore.getState().canDeleteBlocks).toBe(true))
  it('can insert sections', () => expect(useWordoAccessStore.getState().canInsertSections).toBe(true))
  it('can edit header/footer', () => expect(useWordoAccessStore.getState().canEditHeaderFooter).toBe(true))
  it('can set page style', () => expect(useWordoAccessStore.getState().canSetPageStyle).toBe(true))
  it('cannot set watermark', () => expect(useWordoAccessStore.getState().canSetWatermark).toBe(false))
  it('cannot modify styles', () => expect(useWordoAccessStore.getState().canModifyStyles).toBe(false))
  it('can export', () => expect(useWordoAccessStore.getState().canExport).toBe(true))
  it('can import', () => expect(useWordoAccessStore.getState().canImport).toBe(true))
})

describe('useWordoAccessStore — admin mode', () => {
  beforeEach(() => reset('admin'))

  it('can edit body text', () => expect(useWordoAccessStore.getState().canEditBody).toBe(true))
  it('can insert blocks', () => expect(useWordoAccessStore.getState().canInsertBlocks).toBe(true))
  it('can set watermark', () => expect(useWordoAccessStore.getState().canSetWatermark).toBe(true))
  it('can modify styles', () => expect(useWordoAccessStore.getState().canModifyStyles).toBe(true))
  it('can modify template', () => expect(useWordoAccessStore.getState().canModifyTemplate).toBe(true))
  it('can export', () => expect(useWordoAccessStore.getState().canExport).toBe(true))
  it('can import', () => expect(useWordoAccessStore.getState().canImport).toBe(true))
})

describe('useWordoAccessStore — mode switching', () => {
  beforeEach(() => reset('analyst'))

  it('persists mode in localStorage', () => {
    useWordoAccessStore.getState().setMode('admin')
    expect(localStorage.getItem('kasumi_wordo_access_mode')).toBe('admin')
  })

  it('switching analyst → data-entry removes block insertion', () => {
    expect(useWordoAccessStore.getState().canInsertBlocks).toBe(true)
    useWordoAccessStore.getState().setMode('data-entry')
    expect(useWordoAccessStore.getState().canInsertBlocks).toBe(false)
  })

  it('switching data-entry → admin grants watermark', () => {
    useWordoAccessStore.getState().setMode('data-entry')
    expect(useWordoAccessStore.getState().canSetWatermark).toBe(false)
    useWordoAccessStore.getState().setMode('admin')
    expect(useWordoAccessStore.getState().canSetWatermark).toBe(true)
  })

  it('mode field reflects current selection', () => {
    useWordoAccessStore.getState().setMode('data-entry')
    expect(useWordoAccessStore.getState().mode).toBe('data-entry')
    useWordoAccessStore.getState().setMode('admin')
    expect(useWordoAccessStore.getState().mode).toBe('admin')
  })
})
