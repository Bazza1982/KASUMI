import { describe, it, expect } from 'vitest'
import { renderCellValue, getCellBgColor, getSelectOptionStyle, SELECT_COLORS } from '../../modules/excel-shell/grid/renderers'
import type { FieldMeta } from '../../modules/excel-shell/types'

// Helper to build a minimal FieldMeta
function makeField(overrides: Partial<FieldMeta> & { type: FieldMeta['type'] }): FieldMeta {
  return {
    id: 1,
    name: 'Test',
    order: 1,
    primary: false,
    readOnly: false,
    ...overrides,
  }
}

// ─── renderCellValue ─────────────────────────────────────────────────────────

describe('renderCellValue', () => {
  const textField = makeField({ type: 'text' })

  it('returns empty string for null', () => {
    expect(renderCellValue(null, textField)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(renderCellValue(undefined, textField)).toBe('')
  })

  it('returns empty string for empty string', () => {
    expect(renderCellValue('', textField)).toBe('')
  })

  // ── boolean ──────────────────────────────────────────────────────────────

  describe('boolean field', () => {
    const boolField = makeField({ type: 'boolean' })

    it('renders true as ☑', () => {
      expect(renderCellValue(true, boolField)).toBe('☑')
    })

    it('renders false as ☐', () => {
      // false is falsy — but it is not null/undefined/'' so it should still render
      // The function checks `value === null || value === undefined || value === ''`
      // false passes that check, then hits the boolean case
      expect(renderCellValue(false, boolField)).toBe('☐')
    })
  })

  // ── single_select ─────────────────────────────────────────────────────────

  describe('single_select field', () => {
    const ssField = makeField({ type: 'single_select' })

    it('renders object with value property', () => {
      expect(renderCellValue({ value: 'Done' }, ssField)).toBe('Done')
    })

    it('returns empty string for null value', () => {
      expect(renderCellValue(null, ssField)).toBe('')
    })
  })

  // ── multiple_select ───────────────────────────────────────────────────────

  describe('multiple_select field', () => {
    const msField = makeField({ type: 'multiple_select' })

    it('renders array of option objects joined by comma-space', () => {
      expect(renderCellValue([{ value: 'A' }, { value: 'B' }], msField)).toBe('A, B')
    })

    it('returns empty string for null', () => {
      expect(renderCellValue(null, msField)).toBe('')
    })

    it('returns empty string for empty array', () => {
      expect(renderCellValue([], msField)).toBe('')
    })
  })

  // ── date (no time) ────────────────────────────────────────────────────────

  describe('date field without time', () => {
    const dateField = makeField({ type: 'date', dateIncludeTime: false })

    it('renders date string using toLocaleDateString', () => {
      const dateStr = '2024-03-15'
      const expected = new Date(dateStr).toLocaleDateString()
      expect(renderCellValue(dateStr, dateField)).toBe(expected)
    })
  })

  // ── date (with time) ─────────────────────────────────────────────────────

  describe('date field with time', () => {
    const dateTimeField = makeField({ type: 'date', dateIncludeTime: true })

    it('renders date string using toLocaleString when dateIncludeTime is true', () => {
      const dateStr = '2024-03-15T14:30:00Z'
      const expected = new Date(dateStr).toLocaleString()
      expect(renderCellValue(dateStr, dateTimeField)).toBe(expected)
    })
  })

  // ── number ────────────────────────────────────────────────────────────────

  describe('number field', () => {
    it('formats with numberDecimalPlaces=2', () => {
      const numField = makeField({ type: 'number', numberDecimalPlaces: 2 })
      expect(renderCellValue(42.5, numField)).toBe('42.50')
    })

    it('rounds to zero decimal places when numberDecimalPlaces=0', () => {
      const numField = makeField({ type: 'number', numberDecimalPlaces: 0 })
      expect(renderCellValue(42.7, numField)).toBe('43')
    })
  })

  // ── file ──────────────────────────────────────────────────────────────────

  describe('file field', () => {
    const fileField = makeField({ type: 'file' })

    it('renders visible_name of each file joined by comma-space', () => {
      expect(renderCellValue([{ visible_name: 'doc.pdf' }], fileField)).toBe('doc.pdf')
    })
  })

  // ── link_row ──────────────────────────────────────────────────────────────

  describe('link_row field', () => {
    const linkField = makeField({ type: 'link_row' })

    it('renders value of each link joined by comma-space', () => {
      expect(renderCellValue([{ value: 'Related' }], linkField)).toBe('Related')
    })
  })

  // ── text ──────────────────────────────────────────────────────────────────

  describe('text field', () => {
    it('returns the string as-is', () => {
      expect(renderCellValue('hello', makeField({ type: 'text' }))).toBe('hello')
    })
  })

  // ── unknown / fallthrough ─────────────────────────────────────────────────

  describe('unknown type (fallthrough)', () => {
    it('converts value to string', () => {
      // 'email' is a known FieldType but hits the default case in renderCellValue
      const emailField = makeField({ type: 'email' })
      expect(renderCellValue('raw', emailField)).toBe('raw')
    })
  })
})

// ─── getCellBgColor ──────────────────────────────────────────────────────────

describe('getCellBgColor', () => {
  it('returns #e8f5e9 when boolean field value is truthy', () => {
    const boolField = makeField({ type: 'boolean' })
    expect(getCellBgColor(true, boolField)).toBe('#e8f5e9')
  })

  it('returns undefined when boolean field value is falsy', () => {
    const boolField = makeField({ type: 'boolean' })
    expect(getCellBgColor(false, boolField)).toBeUndefined()
  })

  it('returns undefined for a non-boolean field regardless of value', () => {
    const textField = makeField({ type: 'text' })
    expect(getCellBgColor('anything', textField)).toBeUndefined()
  })
})

// ─── getSelectOptionStyle ────────────────────────────────────────────────────

describe('getSelectOptionStyle', () => {
  it('returns style with backgroundColor matching SELECT_COLORS for a known color', () => {
    const style = getSelectOptionStyle('blue')
    expect(style.backgroundColor).toBe(SELECT_COLORS['blue'])
  })

  it('returns style with backgroundColor matching SELECT_COLORS for green', () => {
    const style = getSelectOptionStyle('green')
    expect(style.backgroundColor).toBe(SELECT_COLORS['green'])
  })

  it('falls back to #f5f5f5 for an unknown color key', () => {
    const style = getSelectOptionStyle('rainbow_unicorn')
    expect(style.backgroundColor).toBe('#f5f5f5')
  })

  it('returns an object with the expected CSS properties', () => {
    const style = getSelectOptionStyle('red')
    expect(style).toMatchObject({
      borderRadius: '3px',
      padding: '1px 5px',
      fontSize: '12px',
      display: 'inline-block',
    })
  })
})
