/**
 * Phase 5 Wordo AI-native MCP tools.
 */
import type { McpToolDefinition, McpToolResult } from '../../types'
import { wordoStore } from '../../../store/wordoStore'
import { broadcast } from '../../services/WsServer'
import type { AnyBlock, TableBlock, InlineContent } from '../../../types'

function json(data: unknown): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

function err(msg: string): McpToolResult {
  return { content: [{ type: 'text', text: msg }], isError: true }
}

function blockText(block: AnyBlock): string {
  if (block.type === 'paragraph' || block.type === 'heading' ||
      block.type === 'list_item' || block.type === 'blockquote') {
    return block.content.map(c => c.text).join('')
  }
  if (block.type === 'code_block') return block.content
  return ''
}

// ─── wordo_analyse_document ───────────────────────────────────────────────────

const wordo_analyse_document: McpToolDefinition = {
  name: 'wordo_analyse_document',
  module: 'wordo',
  version: '1.0.0',
  description:
    'Analyse the document: section count, block type breakdown, word count, ' +
    'heading hierarchy depth, table count, and nexcel embed count.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Document identifier (use "1")' },
    },
    required: ['documentId'],
  },
  handler: async () => {
    const doc = wordoStore.getDocument()
    const blockTypes: Record<string, number> = {}
    let wordCount = 0
    let tableCount = 0
    let embedCount = 0
    let headingDepths: number[] = []

    for (const section of doc.sections) {
      for (const block of section.blocks) {
        blockTypes[block.type] = (blockTypes[block.type] ?? 0) + 1
        const text = blockText(block)
        if (text) wordCount += text.trim().split(/\s+/).filter(Boolean).length
        if (block.type === 'table') tableCount++
        if (block.type === 'nexcel_embed') embedCount++
        if (block.type === 'heading') headingDepths.push(block.level)
      }
    }

    const maxDepth = headingDepths.length > 0 ? Math.max(...headingDepths) : 0
    const minDepth = headingDepths.length > 0 ? Math.min(...headingDepths) : 0

    return json({
      documentId: '1',
      title: doc.title,
      sectionCount: doc.sections.length,
      totalBlocks: doc.sections.reduce((n, s) => n + s.blocks.length, 0),
      wordCount,
      blockTypes,
      headingCount: headingDepths.length,
      headingDepthMin: minDepth,
      headingDepthMax: maxDepth,
      tableCount,
      nexcelEmbedCount: embedCount,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    })
  },
}

// ─── wordo_extract_tables ─────────────────────────────────────────────────────

const wordo_extract_tables: McpToolDefinition = {
  name: 'wordo_extract_tables',
  module: 'wordo',
  version: '1.0.0',
  description:
    'Find all table blocks in the document and return their data as arrays of row objects.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Document identifier (use "1")' },
    },
    required: ['documentId'],
  },
  handler: async () => {
    const doc = wordoStore.getDocument()
    const tables: Array<{
      blockId: string
      sectionId: string
      headers: string[]
      rows: string[][]
    }> = []

    for (const section of doc.sections) {
      for (const block of section.blocks) {
        if (block.type !== 'table') continue
        const tb = block as TableBlock

        // First row as header if any cell has header=true, else use row 0 as header
        const firstRow = tb.rows[0]?.cells ?? []
        const hasHeader = firstRow.some(c => c.header === true)

        const headers = hasHeader
          ? firstRow.map(c => c.content.map(i => i.text).join(''))
          : firstRow.map((_, i) => `Col${i + 1}`)

        const dataRows = hasHeader ? tb.rows.slice(1) : tb.rows
        const rows = dataRows.map(r => r.cells.map(c => c.content.map(i => i.text).join('')))

        tables.push({ blockId: block.id, sectionId: section.id, headers, rows })
      }
    }

    return json({ documentId: '1', tableCount: tables.length, tables })
  },
}

// ─── wordo_generate_outline ───────────────────────────────────────────────────

const wordo_generate_outline: McpToolDefinition = {
  name: 'wordo_generate_outline',
  module: 'wordo',
  version: '1.0.0',
  description:
    'Generate a heading outline from the current document content. ' +
    'Returns a hierarchical structure of headings with their block IDs and levels.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Document identifier (use "1")' },
      maxDepth:   { type: 'number', description: 'Only include headings up to this level (1-6, default 6)' },
    },
    required: ['documentId'],
  },
  handler: async (args) => {
    const maxDepth = typeof args.maxDepth === 'number' ? args.maxDepth : 6
    const doc = wordoStore.getDocument()

    type OutlineItem = {
      level: number
      text: string
      blockId: string
      sectionId: string
      children: OutlineItem[]
    }

    const flat: OutlineItem[] = []
    for (const section of doc.sections) {
      for (const block of section.blocks) {
        if (block.type !== 'heading') continue
        if (block.level > maxDepth) continue
        flat.push({
          level: block.level,
          text: block.content.map((c: InlineContent) => c.text).join(''),
          blockId: block.id,
          sectionId: section.id,
          children: [],
        })
      }
    }

    // Build hierarchy
    const root: OutlineItem[] = []
    const stack: OutlineItem[] = []
    for (const item of flat) {
      while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
        stack.pop()
      }
      if (stack.length === 0) {
        root.push(item)
      } else {
        stack[stack.length - 1].children.push(item)
      }
      stack.push(item)
    }

    return json({ documentId: '1', title: doc.title, outline: root })
  },
}

// ─── wordo_normalise_styles ───────────────────────────────────────────────────

const wordo_normalise_styles: McpToolDefinition = {
  name: 'wordo_normalise_styles',
  module: 'wordo',
  version: '1.0.0',
  description:
    'Normalise heading levels so they form a continuous hierarchy starting at H1. ' +
    'Gaps are collapsed (e.g. H1, H3, H5 → H1, H2, H3). Returns number of blocks changed.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Document identifier (use "1")' },
    },
    required: ['documentId'],
  },
  handler: async () => {
    const doc = wordoStore.getDocument()

    // Collect unique heading levels in use
    const levelsInUse = new Set<number>()
    for (const section of doc.sections) {
      for (const block of section.blocks) {
        if (block.type === 'heading') levelsInUse.add(block.level)
      }
    }

    if (levelsInUse.size === 0) return json({ documentId: '1', changed: 0, message: 'No headings found' })

    const sorted = Array.from(levelsInUse).sort((a, b) => a - b)
    const remap: Record<number, number> = {}
    sorted.forEach((orig, idx) => { remap[orig] = idx + 1 })

    let changed = 0
    for (const section of doc.sections) {
      for (const block of section.blocks) {
        if (block.type !== 'heading') continue
        const newLevel = remap[block.level]
        if (newLevel !== block.level) {
          block.level = newLevel as 1 | 2 | 3 | 4 | 5 | 6
          changed++
        }
      }
    }

    if (changed > 0) {
      doc.updatedAt = new Date().toISOString()
      broadcast('wordo:content_updated', { documentId: '1' })
    }

    return json({ documentId: '1', changed, levelMap: remap })
  },
}

// ─── wordo_extract_action_items ───────────────────────────────────────────────

const wordo_extract_action_items: McpToolDefinition = {
  name: 'wordo_extract_action_items',
  module: 'wordo',
  version: '1.0.0',
  description:
    'Scan the document for action item patterns (TODO, ACTION, FIXME, "[ ]", "- [ ]") and ' +
    'return a list with their locations.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Document identifier (use "1")' },
    },
    required: ['documentId'],
  },
  handler: async () => {
    const doc = wordoStore.getDocument()
    const ACTION_PATTERN = /\b(todo|action|fixme|note|follow.?up)\b|\[\s*\]|☐/i

    const items: Array<{
      blockId: string
      sectionId: string
      blockType: string
      text: string
    }> = []

    for (const section of doc.sections) {
      for (const block of section.blocks) {
        const text = blockText(block)
        if (text && ACTION_PATTERN.test(text)) {
          items.push({ blockId: block.id, sectionId: section.id, blockType: block.type, text })
        }
      }
    }

    return json({ documentId: '1', count: items.length, items })
  },
}

// ─── Export ───────────────────────────────────────────────────────────────────

export const wordoAiTools: McpToolDefinition[] = [
  wordo_analyse_document,
  wordo_extract_tables,
  wordo_generate_outline,
  wordo_normalise_styles,
  wordo_extract_action_items,
]
