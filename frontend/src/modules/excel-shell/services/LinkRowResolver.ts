import { NexcelLogger } from './logger'
import type { IBaserowAdapter, RowRecord, FieldMeta } from '../types'

export interface ResolvedLinkRow {
  fieldId: number
  fieldName: string
  linkedTableId: number
  linkedTableName: string
  linkedRows: {
    rowId: number
    primaryValue: string
  }[]
}

export class LinkRowResolver {
  private cache = new Map<string, ResolvedLinkRow>()

  constructor(private adapter: IBaserowAdapter) {}

  // Resolve all link_row fields for a given row
  async resolveLinksForRow(
    tableId: number,
    rowId: number,
    fields: FieldMeta[],
    rowData: RowRecord
  ): Promise<ResolvedLinkRow[]> {
    const linkFields = fields.filter(f => f.type === 'link_row')
    if (linkFields.length === 0) return []

    const results: ResolvedLinkRow[] = []
    for (const field of linkFields) {
      const cacheKey = `${tableId}:${rowId}:${field.id}`
      if (this.cache.has(cacheKey)) {
        results.push(this.cache.get(cacheKey)!)
        continue
      }

      const rawValue = rowData.fields[field.id]
      // Baserow link_row value is array of { id, value } objects
      const linkedItems = Array.isArray(rawValue) ? rawValue as { id: number; value: string }[] : []

      const fieldAny = field as unknown as Record<string, unknown>
      const resolved: ResolvedLinkRow = {
        fieldId: field.id,
        fieldName: field.name,
        linkedTableId: (fieldAny.link_row_table_id as number) ?? 0,
        linkedTableName: (fieldAny.link_row_table as string) ?? '',
        linkedRows: linkedItems.map(item => ({
          rowId: item.id,
          primaryValue: String(item.value ?? item.id)
        }))
      }

      this.cache.set(cacheKey, resolved)
      NexcelLogger.linkRow('debug', 'resolved', { fieldId: field.id, fieldName: field.name, linkedCount: resolved.linkedRows.length })
      results.push(resolved)
    }
    return results
  }

  clearCache() {
    this.cache.clear()
    NexcelLogger.linkRow('info', 'cacheCleared')
  }
}
