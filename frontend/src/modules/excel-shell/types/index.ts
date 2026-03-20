// ─────────────────────────────────────────────
// Core canonical types — the heart of the coord system
// ─────────────────────────────────────────────

export type FieldType =
  | 'text' | 'long_text' | 'number' | 'boolean' | 'date'
  | 'single_select' | 'multiple_select' | 'link_row'
  | 'file' | 'email' | 'url' | 'phone_number'
  | 'formula' | 'lookup' | 'count' | 'rollup'
  | 'created_on' | 'last_modified' | 'uuid' | 'autonumber'
  | 'duration' | 'rating' | 'unknown'

export interface SelectOption {
  id: number
  value: string
  color: string
}

export interface FieldMeta {
  id: number
  name: string
  type: FieldType
  order: number
  primary: boolean
  readOnly: boolean
  // type-specific options
  numberDecimalPlaces?: number
  numberNegative?: boolean
  dateFormat?: string
  dateIncludeTime?: boolean
  selectOptions?: SelectOption[]
}

// A single row record — canonical identity is row id
export interface RowRecord {
  id: number
  order: string
  // fieldId (number) -> raw value
  fields: Record<number, unknown>
}

// A Baserow table (maps to one "sheet" in the workbook)
export interface TableMeta {
  id: number
  name: string
  databaseId: number
  order: number
}

// A Baserow view (filter/sort projection of a table)
export interface ViewMeta {
  id: number
  name: string
  type: string
  order: number
}

// ─────────────────────────────────────────────
// UI coordinate types
// ─────────────────────────────────────────────

// Zero-based UI grid coordinate
export interface GridCoord {
  rowIndex: number
  colIndex: number
}

// Canonical cell reference — always row_id + field_id
export interface CellRef {
  rowId: number
  fieldId: number
}

// Selection range in UI coordinates
export interface SelectionRange {
  startRow: number
  startCol: number
  endRow: number
  endCol: number
}

// ─────────────────────────────────────────────
// Workbook sheet context
// ─────────────────────────────────────────────

export interface SheetContext {
  tableId: number
  tableName: string
  viewId: number | null
  fields: FieldMeta[]          // ordered list of visible fields
  rows: RowRecord[]            // loaded rows
  totalCount: number
  isLoading: boolean
  error: string | null
}

// Maps between UI coordinates and canonical identities
export interface CoordMap {
  // colIndex -> fieldId
  colToFieldId: (colIndex: number) => number | null
  // fieldId -> colIndex
  fieldIdToCol: (fieldId: number) => number | null
  // rowIndex -> rowId
  rowToRowId: (rowIndex: number) => number | null
  // rowId -> rowIndex
  rowIdToRow: (rowId: number) => number | null
}

// ─────────────────────────────────────────────
// Adapter contract
// ─────────────────────────────────────────────

export interface IBaserowAdapter {
  // Load tables for a database
  getTables(databaseId: number): Promise<TableMeta[]>
  // Load fields for a table
  getFields(tableId: number): Promise<FieldMeta[]>
  // Load views for a table
  getViews(tableId: number): Promise<ViewMeta[]>
  // Load rows (paginated)
  getRows(tableId: number, viewId: number | null, page: number, size: number): Promise<{ rows: RowRecord[]; total: number }>
  // Update a single cell
  updateCell(tableId: number, rowId: number, fieldId: number, value: unknown): Promise<void>
  // Batch update cells
  batchUpdate(tableId: number, updates: Array<{ rowId: number; fieldId: number; value: unknown }>): Promise<void>
}
