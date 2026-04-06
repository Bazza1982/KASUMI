import { describe, it, expect, beforeEach } from 'vitest'
import { useWordoAccessStore } from '../../modules/wordo-shell/stores/useWordoAccessStore'

beforeEach(() => {
  useWordoAccessStore.setState(useWordoAccessStore.getInitialState())
})

describe('useWordoAccessStore', () => {
  it('defaults to full editing capabilities', () => {
    const access = useWordoAccessStore.getState()
    expect(access.canEditBody).toBe(true)
    expect(access.canInsertBlocks).toBe(true)
    expect(access.canDeleteBlocks).toBe(true)
    expect(access.canInsertSections).toBe(true)
    expect(access.canEditHeaderFooter).toBe(true)
    expect(access.canSetWatermark).toBe(true)
    expect(access.canSetPageStyle).toBe(true)
    expect(access.canModifyStyles).toBe(true)
    expect(access.canModifyTemplate).toBe(true)
    expect(access.canExport).toBe(true)
    expect(access.canImport).toBe(true)
  })

  it('does not expose per-document mode switching', () => {
    const access = useWordoAccessStore.getState() as unknown as Record<string, unknown>
    expect(access.mode).toBeUndefined()
    expect(access.setMode).toBeUndefined()
  })
})
