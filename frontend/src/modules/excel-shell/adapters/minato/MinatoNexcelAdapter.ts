import type { IBaserowAdapter, TableMeta, FieldMeta, ViewMeta, RowRecord } from '../../types'

/**
 * MinatoNexcelAdapter — implements IBaserowAdapter against a Minato artefact.
 *
 * Instead of calling Kasumi's own api-server, this adapter reads/writes data
 * from a Minato artefact via the Minato API. This allows Kasumi to run as an
 * embedded editor inside Minato without requiring a separate Kasumi service.
 *
 * Data format stored in the artefact envelope's "table" field:
 *   { fields: FieldMeta[], rows: RowRecord[] }
 */
export class MinatoNexcelAdapter implements IBaserowAdapter {
  private apiBase: string
  private artefactId: string

  constructor(apiBase: string, artefactId: string) {
    this.apiBase = apiBase.replace(/\/$/, '')
    this.artefactId = artefactId
  }

  private async fetchTableData(): Promise<{ fields: FieldMeta[]; rows: RowRecord[] }> {
    const res = await fetch(`${this.apiBase}/api/artefacts/kasumi-nexcel/${this.artefactId}`)
    if (!res.ok) throw new Error(`MinatoNexcelAdapter: GET artefact failed (${res.status})`)
    const body = await res.json()
    const rawContent: string | null = body?.data?.content ?? null
    if (!rawContent) return { fields: _defaultFields(), rows: [] }
    try {
      const envelope = JSON.parse(rawContent)
      const table = envelope?.table ?? {}
      return {
        fields: Array.isArray(table.fields) && table.fields.length > 0 ? table.fields : _defaultFields(),
        rows: Array.isArray(table.rows) ? table.rows : [],
      }
    } catch {
      return { fields: _defaultFields(), rows: [] }
    }
  }

  private async writeTableData(fields: FieldMeta[], rows: RowRecord[]): Promise<void> {
    // Read current envelope to preserve metadata (kasumi_type, envelope_version, etc.)
    const res = await fetch(`${this.apiBase}/api/artefacts/kasumi-nexcel/${this.artefactId}`)
    if (!res.ok) throw new Error(`MinatoNexcelAdapter: GET before write failed (${res.status})`)
    const body = await res.json()
    const rawContent: string | null = body?.data?.content ?? null
    const currentTitle: string = body?.data?.artefact?.title ?? 'Nexcel'

    let envelope: Record<string, unknown> = {}
    if (rawContent) {
      try { envelope = JSON.parse(rawContent) } catch { /* use empty */ }
    }

    const updatedEnvelope = {
      ...envelope,
      updated_at: new Date().toISOString(),
      table: { fields, rows },
    }

    const putRes = await fetch(`${this.apiBase}/api/artefacts/kasumi-nexcel/${this.artefactId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: 'kasumi-embed',
        actor_type: 'human',
        correlation_id: `embed-${Date.now()}`,
        payload: {
          artefact_id: this.artefactId,
          title: currentTitle,
          content: JSON.stringify(updatedEnvelope),
        },
      }),
    })
    if (!putRes.ok) throw new Error(`MinatoNexcelAdapter: PUT artefact failed (${putRes.status})`)

    // Notify parent Minato frame that the artefact was saved
    window.parent.postMessage({ type: 'kasumi:saved', artefact_id: this.artefactId }, '*')
  }

  async getTables(_databaseId: number): Promise<TableMeta[]> {
    return [{ id: 1, name: 'Sheet', databaseId: 1, order: 1 }]
  }

  async getFields(_tableId: number): Promise<FieldMeta[]> {
    const { fields } = await this.fetchTableData()
    return fields
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
    const { rows } = await this.fetchTableData()
    const start = (page - 1) * size
    const sliced = rows.slice(start, start + size).map(r => ({
      ...r,
      fields: Object.fromEntries(
        Object.entries(r.fields).map(([k, v]) => [parseInt(k, 10), v])
      ) as Record<number, unknown>,
    }))
    return { rows: sliced, total: rows.length }
  }

  async updateCell(_tableId: number, rowId: number, fieldId: number, value: unknown): Promise<void> {
    const { fields, rows } = await this.fetchTableData()
    const updated = rows.map(r =>
      r.id === rowId ? { ...r, fields: { ...r.fields, [fieldId]: value } } : r
    )
    await this.writeTableData(fields, updated)
  }

  async batchUpdate(
    _tableId: number,
    updates: Array<{ rowId: number; fieldId: number; value: unknown }>,
  ): Promise<void> {
    const { fields, rows } = await this.fetchTableData()
    const changes = new Map<number, Record<number, unknown>>()
    for (const { rowId, fieldId, value } of updates) {
      if (!changes.has(rowId)) changes.set(rowId, {})
      changes.get(rowId)![fieldId] = value
    }
    const updated = rows.map(r => {
      const patch = changes.get(r.id)
      return patch ? { ...r, fields: { ...r.fields, ...patch } } : r
    })
    await this.writeTableData(fields, updated)
  }
}

function _defaultFields(): FieldMeta[] {
  return [
    { id: 1, name: 'Name',  type: 'text', order: 1, primary: true,  readOnly: false },
    { id: 2, name: 'Value', type: 'text', order: 2, primary: false, readOnly: false },
    { id: 3, name: 'Notes', type: 'long_text', order: 3, primary: false, readOnly: false },
  ]
}
