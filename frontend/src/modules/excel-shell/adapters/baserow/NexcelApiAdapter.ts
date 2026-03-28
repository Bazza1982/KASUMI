import type { IBaserowAdapter, TableMeta, FieldMeta, ViewMeta, RowRecord } from '../../types'

const BASE = '/api/nexcel'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) throw new Error(`NexcelAPI ${res.status}: ${path}`)
  const body = await res.json()
  return body.data as T
}

/**
 * NexcelApiAdapter — implements IBaserowAdapter against the local api-server
 * nexcel REST endpoints so that the frontend always reads/writes through the
 * single source of truth (nexcelStore on the server).
 *
 * The nexcel API is single-table/single-database — we expose it as one table
 * with id=1 and one view with id=1 so the adapter contract is satisfied.
 */
export class NexcelApiAdapter implements IBaserowAdapter {
  async getTables(_databaseId: number): Promise<TableMeta[]> {
    return [{ id: 1, name: 'Sheet', databaseId: 1, order: 1 }]
  }

  async getFields(_tableId: number): Promise<FieldMeta[]> {
    return apiFetch<FieldMeta[]>('/columns')
  }

  async getViews(_tableId: number): Promise<ViewMeta[]> {
    return [{ id: 1, name: 'Grid View', type: 'grid', order: 1 }]
  }

  async getRows(
    _tableId: number,
    _viewId: number | null,
    page: number,
    size: number,
  ): Promise<{ rows: RowRecord[]; total: number }> {
    const result = await apiFetch<{ rows: RowRecord[]; total: number; count: number }>(
      `/data?page=${page}&size=${size}`,
    )
    // Ensure numeric field keys survive JSON round-trip (they're already numeric
    // in the store, but explicit conversion guards against edge-cases).
    const rows = result.rows.map(r => ({
      ...r,
      fields: Object.fromEntries(
        Object.entries(r.fields).map(([k, v]) => [parseInt(k, 10), v])
      ) as Record<number, unknown>,
    }))
    return { rows, total: result.total ?? result.count }
  }

  async updateCell(_tableId: number, rowId: number, fieldId: number, value: unknown): Promise<void> {
    await apiFetch(`/rows/${rowId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { [fieldId]: value } }),
    })
  }

  async batchUpdate(
    _tableId: number,
    updates: Array<{ rowId: number; fieldId: number; value: unknown }>,
  ): Promise<void> {
    // Group updates by rowId for efficiency
    const byRow = new Map<number, Record<number, unknown>>()
    for (const { rowId, fieldId, value } of updates) {
      if (!byRow.has(rowId)) byRow.set(rowId, {})
      byRow.get(rowId)![fieldId] = value
    }
    const ops = Array.from(byRow.entries()).map(([id, fields]) => ({ id, fields }))
    await apiFetch('/rows/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ops }),
    })
  }
}
