/**
 * KASUMI Server — Shared In-Memory State
 * Mirrors MockAdapter data semantics for NEXCEL and WORDO.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FieldMeta {
  id: number
  name: string
  type: string
  order: number
  primary: boolean
  readOnly: boolean
  selectOptions?: { id: number; value: string; color: string }[]
  numberDecimalPlaces?: number
  dateFormat?: string
  dateIncludeTime?: boolean
}

export interface RowRecord {
  id: number
  order: string
  fields: Record<number, unknown>
}

export interface CellFormat {
  bold?: boolean
  italic?: boolean
  align?: 'left' | 'center' | 'right'
  bgColor?: string
  textColor?: string
}

export interface ConditionalFormatRule {
  id: string
  fieldId: number
  fieldName: string
  operator: 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt'
  value: string
  bgColor: string
  textColor?: string
}

export interface Comment {
  id: string
  cellRef: string
  text: string
  author: string
  createdAt: string
  resolved: boolean
}

export interface WordoBlock {
  id: string
  type: string
  content: string
  attrs?: Record<string, unknown>
}

export interface WordoSection {
  id: string
  blocks: WordoBlock[]
}

export interface WordoDocument {
  title: string
  sections: WordoSection[]
  updatedAt: string
}

export interface HistoryEntry {
  rows: RowRecord[]
}

// ─── NEXCEL State ─────────────────────────────────────────────────────────────

const MOCK_FIELDS: FieldMeta[] = [
  { id: 1,  name: 'Name',     type: 'text',          order: 1,  primary: true,  readOnly: false },
  { id: 2,  name: 'Status',   type: 'single_select', order: 2,  primary: false, readOnly: false,
    selectOptions: [
      { id: 1, value: 'Todo',        color: 'blue'   },
      { id: 2, value: 'In Progress', color: 'yellow' },
      { id: 3, value: 'Done',        color: 'green'  },
    ]},
  { id: 3,  name: 'Priority', type: 'single_select', order: 3,  primary: false, readOnly: false,
    selectOptions: [
      { id: 4, value: 'Low',    color: 'green'  },
      { id: 5, value: 'Medium', color: 'yellow' },
      { id: 6, value: 'High',   color: 'red'    },
    ]},
  { id: 4,  name: 'Due Date', type: 'date',          order: 4,  primary: false, readOnly: false, dateFormat: 'EU', dateIncludeTime: false },
  { id: 5,  name: 'Assignee', type: 'text',          order: 5,  primary: false, readOnly: false },
  { id: 6,  name: 'Notes',    type: 'long_text',     order: 6,  primary: false, readOnly: false },
  { id: 7,  name: 'Budget',   type: 'number',        order: 7,  primary: false, readOnly: false, numberDecimalPlaces: 2 },
  { id: 8,  name: 'Done',     type: 'boolean',       order: 8,  primary: false, readOnly: false },
  { id: 9,  name: 'Email',    type: 'email',         order: 9,  primary: false, readOnly: false },
  { id: 10, name: 'Created',  type: 'created_on',    order: 10, primary: false, readOnly: true,  dateIncludeTime: true },
]

const SAMPLE_NAMES = [
  'Design new homepage', 'Fix login bug', 'Write unit tests', 'Deploy to staging',
  'Update documentation', 'Code review PR #42', 'Database migration', 'Performance audit',
  'Security scan', 'User interviews', 'Analytics dashboard', 'Mobile responsiveness',
  'API rate limiting', 'Email notifications', 'OAuth integration', 'Dark mode support',
  'Accessibility audit', 'Load testing', 'Error logging', 'Cache invalidation',
]

function generateRows(count: number): RowRecord[] {
  const statuses  = ['Todo', 'In Progress', 'Done']
  const priorities = ['Low', 'Medium', 'High']
  const assignees  = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve']
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    order: `${i + 1}.00000000000000000000`,
    fields: {
      1: SAMPLE_NAMES[i % SAMPLE_NAMES.length] + (i >= SAMPLE_NAMES.length ? ` ${Math.floor(i / SAMPLE_NAMES.length) + 1}` : ''),
      2: { id: (i % 3) + 1, value: statuses[i % 3],   color: ['blue','yellow','green'][i % 3] },
      3: { id: (i % 3) + 4, value: priorities[i % 3], color: ['green','yellow','red'][i % 3] },
      4: `2024-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      5: assignees[i % assignees.length],
      6: i % 3 === 0 ? `Notes for task ${i + 1}` : '',
      7: Math.round((i * 137.41) % 10000) / 100,
      8: i % 3 === 2,
      9: `user${i + 1}@example.com`,
      10: new Date(Date.now() - i * 86400000).toISOString(),
    },
  }))
}

// ─── Mutable State ────────────────────────────────────────────────────────────

export const nexcelState = {
  fields:            [...MOCK_FIELDS] as FieldMeta[],
  rows:              generateRows(500) as RowRecord[],
  cellFormats:       {} as Record<string, CellFormat>,      // key: "rowId:fieldId"
  conditionalRules:  [] as ConditionalFormatRule[],
  comments:          [] as Comment[],
  accessMode:        'analyst' as string,
  undoStack:         [] as HistoryEntry[],
  redoStack:         [] as HistoryEntry[],
  clipboard:         null as RowRecord[] | null,
  nextRowId:         501,
  nextFieldId:       11,
}

export const wordoState = {
  document: {
    title: 'Untitled Document',
    sections: [
      {
        id: 'section-1',
        blocks: [
          { id: 'block-1', type: 'paragraph', content: 'Start typing here...' },
        ],
      },
    ],
    updatedAt: new Date().toISOString(),
  } as WordoDocument,
  comments:     [] as Comment[],
  trackChanges: [] as { id: string; type: string; content: string; author: string; at: string }[],
  accessMode:   'analyst' as string,
}

export const globalState = {
  activeShell: 'nexcel' as 'nexcel' | 'wordo',
}

// ─── History helpers ──────────────────────────────────────────────────────────

export function pushUndo() {
  nexcelState.undoStack.push({ rows: nexcelState.rows.map(r => ({ ...r, fields: { ...r.fields } })) })
  if (nexcelState.undoStack.length > 50) nexcelState.undoStack.shift()
  nexcelState.redoStack = []
}

export function applyUndo(): boolean {
  const entry = nexcelState.undoStack.pop()
  if (!entry) return false
  nexcelState.redoStack.push({ rows: nexcelState.rows.map(r => ({ ...r, fields: { ...r.fields } })) })
  nexcelState.rows = entry.rows
  return true
}

export function applyRedo(): boolean {
  const entry = nexcelState.redoStack.pop()
  if (!entry) return false
  nexcelState.undoStack.push({ rows: nexcelState.rows.map(r => ({ ...r, fields: { ...r.fields } })) })
  nexcelState.rows = entry.rows
  return true
}
