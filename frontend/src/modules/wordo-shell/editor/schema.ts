// WORDO ProseMirror Schema — lists + tables + nexcel_embed
import { Schema, NodeSpec } from 'prosemirror-model'
import { addListNodes } from 'prosemirror-schema-list'
import { schema as basicSchema } from 'prosemirror-schema-basic'
import { tableNodes } from 'prosemirror-tables'

const withLists = addListNodes(basicSchema.spec.nodes, 'paragraph block*', 'block')

const tables = tableNodes({
  tableGroup: 'block',
  cellContent: 'block+',
  cellAttributes: {},
})

// nexcel_embed — an atomic block node that holds embed metadata in attrs
const nexcelEmbedNode: Record<string, NodeSpec> = {
  nexcel_embed: {
    group: 'block',
    atom: true,     // not editable as text
    attrs: {
      sourceObjectId: { default: '' },
      mode: { default: 'snapshot' },
      caption: { default: '' },
      snapshotData: { default: null },
      snapshotAt: { default: null },
    },
    parseDOM: [{ tag: 'div[data-nexcel-embed]' }],
    toDOM: () => ['div', { 'data-nexcel-embed': 'true' }],
  },
}

export const wordoSchema = new Schema({
  nodes: withLists.append(tables).append(nexcelEmbedNode),
  marks: basicSchema.spec.marks,
})

export type WordoSchema = typeof wordoSchema
