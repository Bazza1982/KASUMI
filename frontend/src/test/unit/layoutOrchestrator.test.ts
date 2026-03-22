import { describe, it, expect, beforeEach } from 'vitest'
import { createOrchestrator } from '../../modules/wordo-shell/editor/LayoutOrchestrator'
import { wordoSchema } from '../../modules/wordo-shell/editor/schema'

describe('LayoutOrchestrator — section lifecycle', () => {
  let orch: ReturnType<typeof createOrchestrator>

  beforeEach(() => { orch = createOrchestrator() })

  it('starts empty', () => {
    expect(orch.getSections()).toHaveLength(0)
  })

  it('createSection returns an instance with a doc', () => {
    const inst = orch.createSection('s1')
    expect(inst).toBeDefined()
    expect(inst.sectionId).toBe('s1')
    expect(inst.state.doc).toBeDefined()
  })

  it('getSection returns the created instance', () => {
    orch.createSection('s1')
    expect(orch.getSection('s1')).toBeDefined()
    expect(orch.getSection('s1')?.sectionId).toBe('s1')
  })

  it('getSection returns undefined for unknown id', () => {
    expect(orch.getSection('nope')).toBeUndefined()
  })

  it('getSections returns all created instances', () => {
    orch.createSection('a')
    orch.createSection('b')
    orch.createSection('c')
    expect(orch.getSections()).toHaveLength(3)
  })

  it('removeSection removes the instance', () => {
    orch.createSection('s1')
    orch.removeSection('s1')
    expect(orch.getSection('s1')).toBeUndefined()
    expect(orch.getSections()).toHaveLength(0)
  })

  it('removing non-existent section does not throw', () => {
    expect(() => orch.removeSection('ghost')).not.toThrow()
  })

  it('creating same id twice does not duplicate', () => {
    orch.createSection('dup')
    orch.createSection('dup')
    expect(orch.getSections()).toHaveLength(1)
  })
})

describe('LayoutOrchestrator — applyTransaction', () => {
  let orch: ReturnType<typeof createOrchestrator>

  beforeEach(() => { orch = createOrchestrator() })

  it('applyTransaction updates section state', () => {
    const inst = orch.createSection('s1')
    const para = wordoSchema.nodes.paragraph.create(null, wordoSchema.text('hello'))
    const tr = inst.state.tr.replaceWith(0, inst.state.doc.content.size, para)
    orch.applyTransaction('s1', tr)
    const updated = orch.getSection('s1')!
    expect(updated.state.doc.textContent).toContain('hello')
  })

  it('applyTransaction on unknown section does not throw', () => {
    const inst = orch.createSection('s1')
    const tr = inst.state.tr
    expect(() => orch.applyTransaction('unknown', tr)).not.toThrow()
  })
})

describe('LayoutOrchestrator — focus tracking', () => {
  let orch: ReturnType<typeof createOrchestrator>

  beforeEach(() => { orch = createOrchestrator() })

  it('focused section is null initially', () => {
    expect(orch.getFocusedSection()).toBeNull()
  })

  it('setFocusedSection updates focused id', () => {
    orch.createSection('s1')
    orch.setFocusedSection('s1')
    expect(orch.getFocusedSection()).toBe('s1')
  })

  it('setFocusedSection to null clears focus', () => {
    orch.createSection('s1')
    orch.setFocusedSection('s1')
    orch.setFocusedSection(null)
    expect(orch.getFocusedSection()).toBeNull()
  })

  it('can focus any existing section', () => {
    orch.createSection('a')
    orch.createSection('b')
    orch.setFocusedSection('b')
    expect(orch.getFocusedSection()).toBe('b')
  })
})

describe('LayoutOrchestrator — subscribe', () => {
  let orch: ReturnType<typeof createOrchestrator>

  beforeEach(() => { orch = createOrchestrator() })

  it('subscriber is called after applyTransaction', () => {
    const inst = orch.createSection('s1')
    let calls = 0
    orch.subscribe(() => { calls++ })
    const tr = inst.state.tr
    orch.applyTransaction('s1', tr)
    expect(calls).toBe(1)
  })

  it('unsubscribe stops notifications', () => {
    const inst = orch.createSection('s1')
    let calls = 0
    const unsub = orch.subscribe(() => { calls++ })
    unsub()
    orch.applyTransaction('s1', inst.state.tr)
    expect(calls).toBe(0)
  })

  it('multiple subscribers each receive notifications', () => {
    const inst = orch.createSection('s1')
    let a = 0, b = 0
    orch.subscribe(() => { a++ })
    orch.subscribe(() => { b++ })
    orch.applyTransaction('s1', inst.state.tr)
    expect(a).toBe(1)
    expect(b).toBe(1)
  })
})
