// WORDO ProseMirror Schema — lists + tables + nexcel_embed + extended marks
import { Schema, NodeSpec, MarkSpec } from 'prosemirror-model'
import { addListNodes } from 'prosemirror-schema-list'
import { schema as basicSchema } from 'prosemirror-schema-basic'
import { tableNodes } from 'prosemirror-tables'

// ── Block ID attrs ────────────────────────────────────────────────────────────
// Every block-level node carries these attrs for stable identity + provenance.
// The blockIdPlugin (see blockIdPlugin.ts) auto-assigns values on first transaction.
const blockAttrs = {
  id:         { default: null as string | null },
  createdAt:  { default: null as string | null },
  createdBy:  { default: null as string | null },
  modifiedAt: { default: null as string | null },
  modifiedBy: { default: null as string | null },
}

const paragraphAttrs = {
  textAlign:       { default: null as string | null },
  lineSpacing:     { default: null as string | null },
  spaceBefore:     { default: null as string | null },
  spaceAfter:      { default: null as string | null },
  indentLeft:      { default: null as string | null },
  indentRight:     { default: null as string | null },
  textIndent:      { default: null as string | null },
  pageBreakBefore: { default: false as boolean },
}

function extractParagraphStyleAttrs(dom: HTMLElement): Record<string, string | boolean | null> {
  return {
    textAlign: dom.style.textAlign || null,
    lineSpacing: dom.style.lineHeight || null,
    spaceBefore: dom.style.marginTop || null,
    spaceAfter: dom.style.marginBottom || null,
    indentLeft: dom.style.marginLeft || null,
    indentRight: dom.style.marginRight || null,
    textIndent: dom.style.textIndent || null,
    pageBreakBefore: dom.style.pageBreakBefore === 'always' || dom.style.breakBefore === 'page',
  }
}

function buildParagraphStyle(node: { attrs: Record<string, unknown> }): string | undefined {
  const styles: string[] = []
  if (node.attrs.textAlign) styles.push(`text-align: ${String(node.attrs.textAlign)}`)
  if (node.attrs.lineSpacing) styles.push(`line-height: ${String(node.attrs.lineSpacing)}`)
  if (node.attrs.spaceBefore) styles.push(`margin-top: ${String(node.attrs.spaceBefore)}`)
  if (node.attrs.spaceAfter) styles.push(`margin-bottom: ${String(node.attrs.spaceAfter)}`)
  if (node.attrs.indentLeft) styles.push(`margin-left: ${String(node.attrs.indentLeft)}`)
  if (node.attrs.indentRight) styles.push(`margin-right: ${String(node.attrs.indentRight)}`)
  if (node.attrs.textIndent) styles.push(`text-indent: ${String(node.attrs.textIndent)}`)
  if (node.attrs.pageBreakBefore) styles.push('page-break-before: always')
  return styles.length > 0 ? styles.join('; ') : undefined
}

// Inject block attrs into an existing NodeSpec
function withBlockAttrs(spec: NodeSpec): NodeSpec {
  return {
    ...spec,
    attrs: { ...(spec.attrs ?? {}), ...blockAttrs },
    // Preserve existing parseDOM, but also pull id from DOM if present
    parseDOM: spec.parseDOM?.map(rule => ({
      ...rule,
      getAttrs(dom: HTMLElement | string) {
        const base = typeof rule.getAttrs === 'function' ? rule.getAttrs(dom as HTMLElement) : {}
        if (typeof dom === 'string') return base as Record<string, unknown>
        return {
          ...(base as object),
          id: dom.getAttribute('data-block-id') ?? null,
          createdAt: dom.getAttribute('data-created-at') ?? null,
          createdBy: dom.getAttribute('data-created-by') ?? null,
          modifiedAt: dom.getAttribute('data-modified-at') ?? null,
          modifiedBy: dom.getAttribute('data-modified-by') ?? null,
        }
      },
    })),
    toDOM: spec.toDOM
      ? (node: any) => {
          const result = (spec.toDOM as Function)(node)
          // Inject data attrs into the DOM element attrs object
          if (Array.isArray(result) && result.length >= 2 && typeof result[1] === 'object') {
            result[1]['data-block-id']    = node.attrs.id ?? ''
            result[1]['data-created-at']  = node.attrs.createdAt ?? ''
            result[1]['data-created-by']  = node.attrs.createdBy ?? ''
            result[1]['data-modified-at'] = node.attrs.modifiedAt ?? ''
            result[1]['data-modified-by'] = node.attrs.modifiedBy ?? ''
          }
          return result
        }
      : undefined,
  }
}

function withParagraphAttrs(spec: NodeSpec): NodeSpec {
  return {
    ...spec,
    attrs: { ...(spec.attrs ?? {}), ...paragraphAttrs },
    parseDOM: spec.parseDOM?.map(rule => ({
      ...rule,
      getAttrs(dom: HTMLElement | string) {
        const base = typeof rule.getAttrs === 'function' ? rule.getAttrs(dom as HTMLElement) : (rule.getAttrs ?? {})
        if (base === false) return false
        if (typeof dom === 'string') return base as Record<string, unknown>
        return {
          ...(base as object),
          ...extractParagraphStyleAttrs(dom),
        }
      },
    })),
    toDOM: spec.toDOM
      ? (node: any) => {
          const result = (spec.toDOM as Function)(node)
          const style = buildParagraphStyle(node)
          if (!Array.isArray(result)) return result
          if (result.length >= 2 && typeof result[1] === 'object' && !Array.isArray(result[1])) {
            const attrs = result[1] as Record<string, unknown>
            if (style) attrs.style = attrs.style ? `${String(attrs.style)}; ${style}` : style
            return result
          }
          if (style) result.splice(1, 0, { style })
          return result
        }
      : undefined,
  }
}

// ── Build node set ────────────────────────────────────────────────────────────
const withLists = addListNodes(basicSchema.spec.nodes, 'paragraph block*', 'block')

// Nodes that should carry block attrs (all block-level content nodes)
const BLOCK_NODES = ['paragraph', 'heading', 'blockquote', 'code_block', 'bullet_list', 'ordered_list', 'list_item', 'horizontal_rule', 'image']

let nodes = withLists
BLOCK_NODES.forEach(name => {
  const spec = nodes.get(name)
  if (spec) nodes = nodes.update(name, withBlockAttrs(spec))
})

const paragraphSpec = nodes.get('paragraph')
if (paragraphSpec) nodes = nodes.update('paragraph', withParagraphAttrs(paragraphSpec))

const headingSpec = nodes.get('heading')
if (headingSpec) nodes = nodes.update('heading', withParagraphAttrs(headingSpec))

const tables = tableNodes({
  tableGroup: 'block',
  cellContent: 'block+',
  cellAttributes: {},
})

// nexcel_embed — atomic block node with embed metadata
const nexcelEmbedNode: Record<string, NodeSpec> = {
  nexcel_embed: {
    group: 'block',
    atom: true,
    attrs: {
      ...blockAttrs,
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

// ── Extended marks ────────────────────────────────────────────────────────────
const extendedMarks: Record<string, MarkSpec> = {
  underline: {
    parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }],
    toDOM() { return ['u', 0] },
  },
  strikethrough: {
    parseDOM: [{ tag: 's' }, { tag: 'del' }, { style: 'text-decoration=line-through' }],
    toDOM() { return ['s', 0] },
  },
  highlight: {
    attrs: { color: { default: '#fff176' } },
    parseDOM: [{
      tag: 'mark',
      getAttrs(dom) {
        return { color: (dom as HTMLElement).style.backgroundColor || '#fff176' }
      },
    }],
    toDOM(mark) {
      return ['mark', { style: `background-color: ${mark.attrs.color}` }, 0]
    },
  },
  superscript: {
    parseDOM: [{ tag: 'sup' }],
    toDOM() { return ['sup', 0] },
    excludes: 'subscript',
  },
  subscript: {
    parseDOM: [{ tag: 'sub' }],
    toDOM() { return ['sub', 0] },
    excludes: 'superscript',
  },
  font_size: {
    attrs: { size: { default: null as string | null } },
    parseDOM: [{
      style: 'font-size',
      getAttrs(value) { return { size: value } },
    }],
    toDOM(mark) { return ['span', { style: `font-size: ${mark.attrs.size}` }, 0] },
  },
  font_color: {
    attrs: { color: { default: null as string | null } },
    parseDOM: [{
      style: 'color',
      getAttrs(value) { return { color: value } },
    }],
    toDOM(mark) { return ['span', { style: `color: ${mark.attrs.color}` }, 0] },
  },
  // Track change marks — applied by trackChangePlugin, not by user directly
  track_insert: {
    attrs: {
      changeId:  { default: '' },
      author:    { default: '' },
      timestamp: { default: '' },
    },
    inclusive: true,
    parseDOM: [{ tag: 'ins[data-change-id]', getAttrs(dom) {
      const el = dom as HTMLElement
      return { changeId: el.getAttribute('data-change-id') ?? '', author: el.getAttribute('data-author') ?? '', timestamp: el.getAttribute('data-ts') ?? '' }
    }}],
    toDOM(mark) {
      return ['ins', { 'data-change-id': mark.attrs.changeId, 'data-author': mark.attrs.author, 'data-ts': mark.attrs.timestamp, class: 'wordo-track-insert' }, 0]
    },
  },
  track_delete: {
    attrs: {
      changeId:     { default: '' },
      author:       { default: '' },
      timestamp:    { default: '' },
      originalText: { default: '' },
    },
    inclusive: false,
    parseDOM: [{ tag: 'del[data-track-delete]', getAttrs(dom) {
      const el = dom as HTMLElement
      return { changeId: el.getAttribute('data-change-id') ?? '', author: el.getAttribute('data-author') ?? '', timestamp: el.getAttribute('data-ts') ?? '', originalText: el.getAttribute('data-original') ?? '' }
    }}],
    toDOM(mark) {
      return ['del', { 'data-track-delete': 'true', 'data-change-id': mark.attrs.changeId, 'data-author': mark.attrs.author, 'data-ts': mark.attrs.timestamp, 'data-original': mark.attrs.originalText, class: 'wordo-track-delete' }, 0]
    },
  },
  // Comment anchor — text ranges with attached comments
  comment_ref: {
    attrs: { commentId: { default: '' } },
    inclusive: false,
    parseDOM: [{ tag: 'span[data-comment-id]', getAttrs(dom) {
      return { commentId: (dom as HTMLElement).getAttribute('data-comment-id') ?? '' }
    }}],
    toDOM(mark) {
      return ['span', { 'data-comment-id': mark.attrs.commentId, class: 'wordo-comment-ref' }, 0]
    },
  },
}

// Merge basic marks + extended marks
const allMarks = basicSchema.spec.marks.append(extendedMarks)

// ── Final schema ──────────────────────────────────────────────────────────────
export const wordoSchema = new Schema({
  nodes: nodes.append(tables).append(nexcelEmbedNode),
  marks: allMarks,
})

export type WordoSchema = typeof wordoSchema
