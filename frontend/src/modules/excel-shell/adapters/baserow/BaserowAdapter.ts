import type { IBaserowAdapter, TableMeta, FieldMeta, ViewMeta, RowRecord, FieldType } from '../../types'
import { BaserowHttpClient, type BaserowConfig } from './client'

// ─── Raw API shapes ───────────────────────────────────────────────────────────

interface RawField {
  id: number
  name: string
  type: string
  order: number
  primary: boolean
  read_only: boolean
  number_decimal_places?: number
  number_negative?: boolean
  date_format?: string
  date_include_time?: boolean
  select_options?: Array<{ id: number; value: string; color: string }>
}

interface RawTable { id: number; name: string; database_id: number; order: number }
interface RawView { id: number; name: string; type: string; order: number }
interface RawRowsResponse { count: number; results: Record<string, unknown>[] }

// ─── Normalizers ─────────────────────────────────────────────────────────────

function normalizeField(raw: RawField): FieldMeta {
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type as FieldType,
    order: raw.order,
    primary: raw.primary,
    readOnly: raw.read_only,
    numberDecimalPlaces: raw.number_decimal_places,
    numberNegative: raw.number_negative,
    dateFormat: raw.date_format,
    dateIncludeTime: raw.date_include_time,
    selectOptions: raw.select_options,
  }
}

function normalizeRow(raw: Record<string, unknown>): RowRecord {
  const fields: Record<number, unknown> = {}
  for (const [key, val] of Object.entries(raw)) {
    const match = key.match(/^field_(\d+)$/)
    if (match) fields[parseInt(match[1], 10)] = val
  }
  return { id: raw.id as number, order: raw.order as string, fields }
}

// ─── Real adapter ─────────────────────────────────────────────────────────────

export class BaserowAdapter implements IBaserowAdapter {
  private client: BaserowHttpClient

  constructor(config: BaserowConfig) {
    this.client = new BaserowHttpClient(config)
  }

  async getTables(databaseId: number): Promise<TableMeta[]> {
    const data = await this.client.get<{ tables: RawTable[] }>(`/database/databases/${databaseId}/`)
    return (data.tables || []).map(t => ({ id: t.id, name: t.name, databaseId: t.database_id, order: t.order }))
  }

  async getFields(tableId: number): Promise<FieldMeta[]> {
    const data = await this.client.get<{ count: number; results: RawField[] }>(`/database/fields/?table_id=${tableId}`)
    return (data.results || []).sort((a, b) => a.order - b.order).map(normalizeField)
  }

  async getViews(tableId: number): Promise<ViewMeta[]> {
    const data = await this.client.get<{ count: number; results: RawView[] }>(`/database/views/?table_id=${tableId}`)
    return (data.results || []).sort((a, b) => a.order - b.order).map(v => ({
      id: v.id, name: v.name, type: v.type, order: v.order
    }))
  }

  async getRows(tableId: number, viewId: number | null, page: number, size: number): Promise<{ rows: RowRecord[]; total: number }> {
    const params = new URLSearchParams({ page: String(page), size: String(size) })
    if (viewId) params.set('view_id', String(viewId))
    const data = await this.client.get<RawRowsResponse>(`/database/rows/table/${tableId}/?${params}`)
    return { rows: (data.results || []).map(normalizeRow), total: data.count }
  }

  async updateCell(tableId: number, rowId: number, fieldId: number, value: unknown): Promise<void> {
    await this.client.patch(`/database/rows/table/${tableId}/${rowId}/`, { [`field_${fieldId}`]: value })
  }

  async batchUpdate(tableId: number, updates: Array<{ rowId: number; fieldId: number; value: unknown }>): Promise<void> {
    // Group by rowId
    const byRow = new Map<number, Record<string, unknown>>()
    for (const { rowId, fieldId, value } of updates) {
      if (!byRow.has(rowId)) byRow.set(rowId, { id: rowId })
      byRow.get(rowId)![`field_${fieldId}`] = value
    }
    await this.client.patch(`/database/rows/table/${tableId}/batch/`, { items: Array.from(byRow.values()) })
  }
}
