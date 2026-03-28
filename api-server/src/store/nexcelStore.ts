import { v4 as uuidv4 } from 'uuid'
import type {
  FieldMeta, RowRecord, CellFormat, ConditionalFormatRule,
  SortConfig, FilterRule, SelectOption,
} from '../types'

// ─── MOCK DATA GENERATION ────────────────────────────────────────────────────

const STATUSES: SelectOption[] = [
  { id: 1, value: 'Todo',        color: '#94a3b8' },
  { id: 2, value: 'In Progress', color: '#60a5fa' },
  { id: 3, value: 'Done',        color: '#4ade80' },
  { id: 4, value: 'Blocked',     color: '#f87171' },
]

const PRIORITIES: SelectOption[] = [
  { id: 5, value: 'Low',    color: '#86efac' },
  { id: 6, value: 'Medium', color: '#fcd34d' },
  { id: 7, value: 'High',   color: '#f87171' },
]

const ASSIGNEES = ['Barry Li', 'Lin Yueru', 'Alex Wang', 'Sarah Chen', 'David Liu']

export const FIELDS: FieldMeta[] = [
  { id: 1, name: 'Name',     type: 'text',          order: 1, primary: true,  readOnly: false },
  { id: 2, name: 'Status',   type: 'single_select', order: 2, primary: false, readOnly: false, selectOptions: STATUSES },
  { id: 3, name: 'Priority', type: 'single_select', order: 3, primary: false, readOnly: false, selectOptions: PRIORITIES },
  { id: 4, name: 'Due Date', type: 'date',          order: 4, primary: false, readOnly: false, dateFormat: 'ISO', dateIncludeTime: false },
  { id: 5, name: 'Assignee', type: 'text',          order: 5, primary: false, readOnly: false },
  { id: 6, name: 'Notes',    type: 'long_text',     order: 6, primary: false, readOnly: false },
  { id: 7, name: 'Budget',   type: 'number',        order: 7, primary: false, readOnly: false, numberDecimalPlaces: 2 },
  { id: 8, name: 'Done',     type: 'boolean',       order: 8, primary: false, readOnly: false },
  { id: 9, name: 'Email',    type: 'email',         order: 9, primary: false, readOnly: false },
]

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomDate(start: Date, end: Date): string {
  const d = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
  return d.toISOString().split('T')[0]
}

function generateRows(count: number): RowRecord[] {
  const now = new Date()
  const start = new Date('2025-01-01')
  const end = new Date('2026-12-31')
  const rows: RowRecord[] = []

  const prefixes = ['Implement', 'Design', 'Review', 'Test', 'Deploy', 'Update', 'Fix', 'Refactor', 'Document', 'Analyse']
  const subjects = ['API', 'UI', 'database', 'authentication', 'dashboard', 'report', 'pipeline', 'integration', 'module', 'feature']

  for (let i = 1; i <= count; i++) {
    const status = pickRandom(STATUSES)
    const priority = pickRandom(PRIORITIES)
    rows.push({
      id: i,
      order: i.toFixed(5),
      fields: {
        1: `${pickRandom(prefixes)} ${pickRandom(subjects)} ${i}`,
        2: status.value,
        3: priority.value,
        4: randomDate(start, end),
        5: pickRandom(ASSIGNEES),
        6: i % 5 === 0 ? `Notes for task ${i}. Important context here.` : '',
        7: Math.round(Math.random() * 50000) / 100,
        8: status.value === 'Done',
        9: `user${i}@kasumi.app`,
      },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })
  }
  return rows
}

// ─── NEXCEL STORE CLASS ───────────────────────────────────────────────────────

class NexcelStore {
  fields: FieldMeta[] = JSON.parse(JSON.stringify(FIELDS))
  rows: RowRecord[] = generateRows(500)
  formats: Map<string, CellFormat> = new Map()           // key: "rowId:fieldId"
  conditionalRules: ConditionalFormatRule[] = []
  accessMode: 'data-entry' | 'analyst' | 'admin' = 'analyst'
  activeShell: 'nexcel' | 'wordo' = 'nexcel'

  // clipboard (server-side copy state)
  clipboard: { rows: RowRecord[]; fieldIds: number[] } | null = null

  private undoStack: RowRecord[][] = []
  private redoStack: RowRecord[][] = []

  private snapshot() {
    this.undoStack.push(JSON.parse(JSON.stringify(this.rows)))
    if (this.undoStack.length > 50) this.undoStack.shift()
    this.redoStack = []
  }

  getRows(opts: {
    search?: string
    filter?: FilterRule[]
    sort?: SortConfig
    page?: number
    size?: number
  }): { rows: RowRecord[]; total: number; page: number; size: number } {
    let result = [...this.rows]

    if (opts.search) {
      const q = opts.search.toLowerCase()
      result = result.filter(r =>
        Object.values(r.fields).some(v => String(v ?? '').toLowerCase().includes(q))
      )
    }

    if (opts.filter?.length) {
      for (const f of opts.filter) {
        result = result.filter(r => {
          const val = String(r.fields[f.fieldId] ?? '')
          switch (f.type) {
            case 'contains':  return val.toLowerCase().includes(f.value.toLowerCase())
            case 'equals':    return val === f.value
            case 'is_empty':  return !val || val === 'null'
            case 'not_empty': return !!(val && val !== 'null')
            case 'gt':        return parseFloat(val) > parseFloat(f.value)
            case 'lt':        return parseFloat(val) < parseFloat(f.value)
            default:          return true
          }
        })
      }
    }

    if (opts.sort) {
      const { fieldId, direction } = opts.sort
      result.sort((a, b) => {
        const av = String(a.fields[fieldId] ?? '')
        const bv = String(b.fields[fieldId] ?? '')
        return direction === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      })
    }

    const total = result.length
    const page = opts.page ?? 1
    const size = opts.size ?? 100
    const start = (page - 1) * size

    return { rows: result.slice(start, start + size), total, page, size }
  }

  getRow(id: number): RowRecord | undefined {
    return this.rows.find(r => r.id === id)
  }

  addRow(fields?: Record<number, unknown>): RowRecord {
    this.snapshot()
    const id = this.rows.length > 0 ? Math.max(...this.rows.map(r => r.id)) + 1 : 1
    const now = new Date().toISOString()
    const row: RowRecord = {
      id,
      order: id.toFixed(5),
      fields: fields ?? { 1: `New Row ${id}` },
      createdAt: now,
      updatedAt: now,
    }
    this.rows.push(row)
    return row
  }

  updateRow(id: number, fields: Record<number, unknown>): RowRecord | null {
    this.snapshot()
    const row = this.rows.find(r => r.id === id)
    if (!row) return null
    Object.assign(row.fields, fields)
    row.updatedAt = new Date().toISOString()
    return row
  }

  deleteRow(id: number): boolean {
    this.snapshot()
    const idx = this.rows.findIndex(r => r.id === id)
    if (idx === -1) return false
    this.rows.splice(idx, 1)
    return true
  }

  batchUpsert(ops: Array<{ id?: number; fields: Record<number, unknown> }>): RowRecord[] {
    this.snapshot()
    const now = new Date().toISOString()
    const result: RowRecord[] = []
    for (const op of ops) {
      if (op.id) {
        const row = this.rows.find(r => r.id === op.id)
        if (row) {
          Object.assign(row.fields, op.fields)
          row.updatedAt = now
          result.push(row)
        }
      } else {
        result.push(this.addRow(op.fields))
      }
    }
    return result
  }

  addField(field: Omit<FieldMeta, 'id' | 'order'>): FieldMeta {
    const id = this.fields.length > 0 ? Math.max(...this.fields.map(f => f.id)) + 1 : 1
    const order = this.fields.length + 1
    const newField: FieldMeta = { id, order, ...field }
    this.fields.push(newField)
    return newField
  }

  updateField(id: number, patch: Partial<FieldMeta>): FieldMeta | null {
    const field = this.fields.find(f => f.id === id)
    if (!field) return null
    Object.assign(field, patch)
    return field
  }

  deleteField(id: number): boolean {
    const idx = this.fields.findIndex(f => f.id === id)
    if (idx === -1) return false
    this.fields.splice(idx, 1)
    this.rows.forEach(r => { delete r.fields[id] })
    return true
  }

  setFormat(rowId: number, fieldId: number, fmt: Partial<CellFormat>): void {
    const key = `${rowId}:${fieldId}`
    const existing = this.formats.get(key) ?? {}
    this.formats.set(key, { ...existing, ...fmt })
  }

  getFormat(rowId: number, fieldId: number): CellFormat {
    return this.formats.get(`${rowId}:${fieldId}`) ?? {}
  }

  addConditionalRule(rule: Omit<ConditionalFormatRule, 'id'>): ConditionalFormatRule {
    const r = { ...rule, id: uuidv4() }
    this.conditionalRules.push(r)
    return r
  }

  deleteConditionalRule(id: string): boolean {
    const idx = this.conditionalRules.findIndex(r => r.id === id)
    if (idx === -1) return false
    this.conditionalRules.splice(idx, 1)
    return true
  }

  undo(): boolean {
    if (this.undoStack.length === 0) return false
    this.redoStack.push(JSON.parse(JSON.stringify(this.rows)))
    this.rows = this.undoStack.pop()!
    return true
  }

  redo(): boolean {
    if (this.redoStack.length === 0) return false
    this.undoStack.push(JSON.parse(JSON.stringify(this.rows)))
    this.rows = this.redoStack.pop()!
    return true
  }

  copyToClipboard(rowIds: number[], fieldIds: number[]): void {
    this.clipboard = {
      rows: rowIds.map(id => this.rows.find(r => r.id === id)).filter(Boolean) as RowRecord[],
      fieldIds,
    }
  }

  pasteFromClipboard(targetRowId: number, targetFieldId: number): RowRecord[] {
    if (!this.clipboard) return []
    this.snapshot()
    const result: RowRecord[] = []
    const { rows, fieldIds } = this.clipboard
    rows.forEach((srcRow, ri) => {
      const destId = targetRowId + ri
      const destRow = this.rows.find(r => r.id === destId)
      if (!destRow) return
      fieldIds.forEach((srcFid, ci) => {
        const destFid = targetFieldId + ci
        destRow.fields[destFid] = srcRow.fields[srcFid]
      })
      destRow.updatedAt = new Date().toISOString()
      result.push(destRow)
    })
    return result
  }

  /** Reset to a blank Excel-like workbook: 26 unnamed text columns, 100 empty rows. */
  resetToBlank(): void {
    const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    this.fields = LETTERS.split('').map((letter, i) => ({
      id: i + 1,
      name: '',          // empty name → VirtualGrid shows only the letter
      type: 'text' as const,
      order: i + 1,
      primary: i === 0,
      readOnly: false,
    }))
    this.rows = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      order: (i + 1).toFixed(5),
      fields: {} as Record<number, unknown>,
    }))
    this.formats = new Map()
    this.conditionalRules = []
    this.undoStack = []
    this.redoStack = []
  }

  exportCsv(): string {
    const header = this.fields.map(f => f.name).join(',')
    const dataRows = this.rows.map(r =>
      this.fields.map(f => {
        const v = r.fields[f.id]
        const s = String(v ?? '')
        return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
      }).join(',')
    )
    return [header, ...dataRows].join('\n')
  }
}

export const nexcelStore = new NexcelStore()
