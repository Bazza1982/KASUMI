import type { McpResourceDefinition } from '../../types'
import { nexcelStore } from '../../../store/nexcelStore'
import { indexToColLetter } from './a1'

export const nexcelResources: McpResourceDefinition[] = [
  {
    uriPattern: 'kasumi://nexcel/sheet/1/raw',
    module: 'nexcel',
    version: '1.0.0',
    description: 'Raw cell grid for the current NEXCEL sheet',
    mimeType: 'application/json',
    read: async (uri) => {
      const fields = nexcelStore.fields
      const rows = nexcelStore.getRows({ page: 1, size: 9999 }).rows
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({
          columns: fields.map(f => ({
            id: f.id,
            letter: indexToColLetter(f.order),
            name: f.name || indexToColLetter(f.order),
            type: f.type,
          })),
          rows: rows.map(r => ({
            id: r.id,
            cells: fields.reduce<Record<string, unknown>>((acc, f) => {
              acc[indexToColLetter(f.order)] = r.fields[f.id] ?? null
              return acc
            }, {}),
          })),
        }, null, 2),
      }
    },
  },

  {
    uriPattern: 'kasumi://nexcel/sheet/1/columns',
    module: 'nexcel',
    version: '1.0.0',
    description: 'Column definitions for the current NEXCEL sheet',
    mimeType: 'application/json',
    read: async (uri) => {
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(nexcelStore.fields.map(f => ({
          id: f.id,
          letter: indexToColLetter(f.order),
          name: f.name || indexToColLetter(f.order),
          type: f.type,
          primary: f.primary,
        })), null, 2),
      }
    },
  },
]
