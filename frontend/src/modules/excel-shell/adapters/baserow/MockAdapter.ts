import type { IBaserowAdapter, TableMeta, FieldMeta, ViewMeta, RowRecord } from '../../types'

// Mock data that simulates a Baserow database with sample data
const MOCK_FIELDS: FieldMeta[] = [
  { id: 1, name: 'Name',        type: 'text',          order: 1, primary: true,  readOnly: false },
  { id: 2, name: 'Status',      type: 'single_select', order: 2, primary: false, readOnly: false, selectOptions: [
    { id: 1, value: 'Todo',        color: 'blue' },
    { id: 2, value: 'In Progress', color: 'yellow' },
    { id: 3, value: 'Done',        color: 'green' },
  ]},
  { id: 3, name: 'Priority',    type: 'single_select', order: 3, primary: false, readOnly: false, selectOptions: [
    { id: 4, value: 'Low',    color: 'green' },
    { id: 5, value: 'Medium', color: 'yellow' },
    { id: 6, value: 'High',   color: 'red' },
  ]},
  { id: 4, name: 'Due Date',    type: 'date',          order: 4, primary: false, readOnly: false, dateFormat: 'EU', dateIncludeTime: false },
  { id: 5, name: 'Assignee',    type: 'text',          order: 5, primary: false, readOnly: false },
  { id: 6, name: 'Notes',       type: 'long_text',     order: 6, primary: false, readOnly: false },
  { id: 7, name: 'Budget',      type: 'number',        order: 7, primary: false, readOnly: false, numberDecimalPlaces: 2 },
  { id: 8, name: 'Done',        type: 'boolean',       order: 8, primary: false, readOnly: false },
  { id: 9, name: 'Email',       type: 'email',         order: 9, primary: false, readOnly: false },
  { id: 10, name: 'Created',    type: 'created_on',    order: 10, primary: false, readOnly: true,  dateIncludeTime: true },
]

const SAMPLE_NAMES = [
  'Design new homepage', 'Fix login bug', 'Write unit tests', 'Deploy to staging',
  'Update documentation', 'Code review PR #42', 'Database migration', 'Performance audit',
  'Security scan', 'User interviews', 'Analytics dashboard', 'Mobile responsiveness',
  'API rate limiting', 'Email notifications', 'OAuth integration', 'Dark mode support',
  'Accessibility audit', 'Load testing', 'Error logging', 'Cache invalidation',
]

function generateMockRows(count: number): RowRecord[] {
  const statuses = ['Todo', 'In Progress', 'Done']
  const priorities = ['Low', 'Medium', 'High']
  const assignees = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve']

  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    order: `${i + 1}.00000000000000000000`,
    fields: {
      1: SAMPLE_NAMES[i % SAMPLE_NAMES.length] + (i >= SAMPLE_NAMES.length ? ` ${Math.floor(i / SAMPLE_NAMES.length) + 1}` : ''),
      2: { id: (i % 3) + 1, value: statuses[i % 3], color: ['blue','yellow','green'][i % 3] },
      3: { id: (i % 3) + 4, value: priorities[i % 3], color: ['green','yellow','red'][i % 3] },
      4: `2024-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      5: assignees[i % assignees.length],
      6: i % 3 === 0 ? `Notes for task ${i + 1}` : '',
      7: Math.round(Math.random() * 10000) / 100,
      8: i % 3 === 2,
      9: `user${i + 1}@example.com`,
      10: new Date(Date.now() - i * 86400000).toISOString(),
    }
  }))
}

const ALL_ROWS = generateMockRows(500)

export class MockAdapter implements IBaserowAdapter {
  // In-memory mutations
  private rows: RowRecord[] = ALL_ROWS.map(r => ({ ...r, fields: { ...r.fields } }))

  async getTables(_databaseId: number): Promise<TableMeta[]> {
    return [
      { id: 1, name: 'Tasks',    databaseId: 1, order: 1 },
      { id: 2, name: 'Projects', databaseId: 1, order: 2 },
      { id: 3, name: 'Team',     databaseId: 1, order: 3 },
    ]
  }

  async getFields(_tableId: number): Promise<FieldMeta[]> {
    return MOCK_FIELDS
  }

  async getViews(_tableId: number): Promise<ViewMeta[]> {
    return [
      { id: 1, name: 'Grid View',   type: 'grid', order: 1 },
      { id: 2, name: 'My Tasks',    type: 'grid', order: 2 },
      { id: 3, name: 'In Progress', type: 'grid', order: 3 },
    ]
  }

  async getRows(_tableId: number, _viewId: number | null, page: number, size: number): Promise<{ rows: RowRecord[]; total: number }> {
    const start = (page - 1) * size
    return { rows: this.rows.slice(start, start + size), total: this.rows.length }
  }

  async updateCell(_tableId: number, rowId: number, fieldId: number, value: unknown): Promise<void> {
    const row = this.rows.find(r => r.id === rowId)
    if (row) row.fields[fieldId] = value
  }

  async batchUpdate(_tableId: number, updates: Array<{ rowId: number; fieldId: number; value: unknown }>): Promise<void> {
    for (const { rowId, fieldId, value } of updates) {
      const row = this.rows.find(r => r.id === rowId)
      if (row) row.fields[fieldId] = value
    }
  }
}
