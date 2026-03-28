import { v4 as uuidv4 } from 'uuid'
import type { McpToolDefinition, McpToolResult } from '../../types'
import { wordoStore } from '../../../store/wordoStore'
import { broadcast } from '../../services/WsServer'
import type { AnyBlock, InlineContent } from '../../../types'

function json(data: unknown): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

function err(msg: string): McpToolResult {
  return { content: [{ type: 'text', text: msg }], isError: true }
}

/** Extract plain text from a block */
function blockText(block: AnyBlock): string {
  if (block.type === 'paragraph' || block.type === 'heading' ||
      block.type === 'list_item' || block.type === 'blockquote') {
    return block.content.map(c => c.text).join('')
  }
  if (block.type === 'code_block') return block.content
  if (block.type === 'page_break') return ''
  if (block.type === 'nexcel_embed') return `[Nexcel embed: ${block.sourceObjectId}]`
  return ''
}

// ─── READ TOOLS ───────────────────────────────────────────────────────────────

const wordo_read_document: McpToolDefinition = {
  name: 'wordo_read_document',
  module: 'wordo',
  version: '1.0.0',
  description: 'Read the full document structure: title, sections, and all blocks with their content.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Document identifier (use "1" for the current document)' },
      format: { type: 'string', description: '"json" (default) or "markdown"', enum: ['json', 'markdown'] },
    },
    required: ['documentId'],
  },
  handler: async (args) => {
    const format = String(args.format ?? 'json')
    if (format === 'markdown') {
      return { content: [{ type: 'text', text: wordoStore.exportMarkdown(), mimeType: 'text/markdown' }] }
    }
    return json(wordoStore.getDocument())
  },
}

const wordo_read_section: McpToolDefinition = {
  name: 'wordo_read_section',
  module: 'wordo',
  version: '1.0.0',
  description: 'Read a single section by its ID, returning all blocks in that section.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Document identifier (use "1")' },
      sectionId: { type: 'string', description: 'Section UUID' },
    },
    required: ['documentId', 'sectionId'],
  },
  handler: async (args) => {
    const section = wordoStore.getSection(String(args.sectionId ?? ''))
    if (!section) return err(`Section not found: ${args.sectionId}`)
    return json(section)
  },
}

const wordo_get_outline: McpToolDefinition = {
  name: 'wordo_get_outline',
  module: 'wordo',
  version: '1.0.0',
  description: 'Get the document heading outline (hierarchy of headings with section and block IDs).',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Document identifier (use "1")' },
    },
    required: ['documentId'],
  },
  handler: async () => {
    const outline = wordoStore.getOutline()
    return json({ documentId: '1', outline })
  },
}

const wordo_find_text: McpToolDefinition = {
  name: 'wordo_find_text',
  module: 'wordo',
  version: '1.0.0',
  description: 'Search all text content in the document for a query string. Returns matching blocks with context.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Document identifier (use "1")' },
      query: { type: 'string', description: 'Search term (case-insensitive)' },
      maxResults: { type: 'number', description: 'Max matches to return (default 20)' },
    },
    required: ['documentId', 'query'],
  },
  handler: async (args) => {
    const query = String(args.query ?? '').toLowerCase()
    if (!query) return err('query cannot be empty')
    const maxResults = typeof args.maxResults === 'number' ? args.maxResults : 20

    const matches: Array<{
      sectionId: string
      blockId: string
      blockType: string
      text: string
      matchCount: number
    }> = []

    outer:
    for (const section of wordoStore.getDocument().sections) {
      for (const block of section.blocks) {
        const text = blockText(block)
        if (text.toLowerCase().includes(query)) {
          const matchCount = (text.toLowerCase().match(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length
          matches.push({ sectionId: section.id, blockId: block.id, blockType: block.type, text, matchCount })
          if (matches.length >= maxResults) break outer
        }
      }
    }

    return json({ query, matchCount: matches.length, truncated: matches.length >= maxResults, matches })
  },
}

// ─── WRITE TOOLS ──────────────────────────────────────────────────────────────

const wordo_write_block: McpToolDefinition = {
  name: 'wordo_write_block',
  module: 'wordo',
  version: '1.0.0',
  description: 'Update the text content of an existing block by its ID. For headings, also set the level.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Document identifier (use "1")' },
      blockId: { type: 'string', description: 'Block UUID to update' },
      text: { type: 'string', description: 'New plain text content for the block' },
      level: { type: 'number', description: 'Heading level 1-6 (only for heading blocks)' },
    },
    required: ['documentId', 'blockId', 'text'],
  },
  handler: async (args) => {
    const blockId = String(args.blockId ?? '')
    const found = wordoStore.findBlock(blockId)
    if (!found) return err(`Block not found: ${blockId}`)

    const text = String(args.text ?? '')
    // Use a loose patch object — AnyBlock is a discriminated union so we cast
    const patch: Record<string, unknown> = {}

    if (found.block.type === 'paragraph' || found.block.type === 'blockquote' || found.block.type === 'list_item') {
      patch.content = [{ text }] as InlineContent[]
    } else if (found.block.type === 'heading') {
      patch.content = [{ text }] as InlineContent[]
      if (args.level) {
        patch.level = Math.min(6, Math.max(1, Number(args.level)))
      }
    } else if (found.block.type === 'code_block') {
      patch.content = text
    } else {
      return err(`Block type "${found.block.type}" does not support text editing`)
    }

    const updated = wordoStore.updateBlock(blockId, patch as Partial<AnyBlock>)
    broadcast('wordo:block_updated', { documentId: '1', blockId, blockType: found.block.type })
    return json(updated)
  },
}

const wordo_insert_paragraph: McpToolDefinition = {
  name: 'wordo_insert_paragraph',
  module: 'wordo',
  version: '1.0.0',
  description: 'Insert a new block (paragraph, heading, list item, or blockquote) into a section.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Document identifier (use "1")' },
      sectionId: { type: 'string', description: 'Section UUID to insert into. Use the first section if unsure.' },
      type: {
        type: 'string',
        description: 'Block type',
        enum: ['paragraph', 'heading', 'list_item', 'blockquote', 'code_block', 'page_break'],
      },
      text: { type: 'string', description: 'Text content of the block' },
      afterBlockId: { type: 'string', description: 'Insert after this block ID. If omitted, appends to end of section.' },
      level: { type: 'number', description: 'Heading level 1-6 (only for heading type)' },
      listType: { type: 'string', description: '"bullet" or "ordered" (only for list_item type)', enum: ['bullet', 'ordered'] },
      language: { type: 'string', description: 'Code language (only for code_block type)' },
    },
    required: ['documentId', 'sectionId', 'type', 'text'],
  },
  handler: async (args) => {
    const sectionId = String(args.sectionId ?? '')
    const section = wordoStore.getSection(sectionId)
    if (!section) return err(`Section not found: ${sectionId}`)

    const type = String(args.type ?? 'paragraph')
    const text = String(args.text ?? '')
    const afterBlockId = args.afterBlockId ? String(args.afterBlockId) : undefined

    // Build block as a plain object then cast — AnyBlock is a discriminated
    // union and TypeScript can't narrow through a runtime string switch
    let blockRaw: Record<string, unknown>
    switch (type) {
      case 'heading':
        blockRaw = { type: 'heading', level: (Number(args.level) || 2), content: [{ text }] }
        break
      case 'list_item':
        blockRaw = { type: 'list_item', listType: (args.listType as string) ?? 'bullet', level: 0, content: [{ text }] }
        break
      case 'blockquote':
        blockRaw = { type: 'blockquote', content: [{ text }] }
        break
      case 'code_block':
        blockRaw = { type: 'code_block', content: text, language: args.language ? String(args.language) : undefined }
        break
      case 'page_break':
        blockRaw = { type: 'page_break' }
        break
      default:
        blockRaw = { type: 'paragraph', content: [{ text }] }
    }
    const blockDef = blockRaw as unknown as Omit<AnyBlock, 'id'>

    const inserted = wordoStore.insertBlock(sectionId, blockDef, afterBlockId)
    broadcast('wordo:block_inserted', { documentId: '1', sectionId, blockId: inserted.id })
    return json(inserted)
  },
}

const wordo_delete_block: McpToolDefinition = {
  name: 'wordo_delete_block',
  module: 'wordo',
  version: '1.0.0',
  description: 'Delete a block by its ID.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Document identifier (use "1")' },
      blockId: { type: 'string', description: 'Block UUID to delete' },
    },
    required: ['documentId', 'blockId'],
  },
  handler: async (args) => {
    const blockId = String(args.blockId ?? '')
    const deleted = wordoStore.deleteBlock(blockId)
    if (!deleted) return err(`Block not found: ${blockId}`)
    broadcast('wordo:block_deleted', { documentId: '1', blockId })
    return json({ deleted: true, blockId })
  },
}

const wordo_replace_text: McpToolDefinition = {
  name: 'wordo_replace_text',
  module: 'wordo',
  version: '1.0.0',
  description: 'Find and replace text across the entire document. Returns count of replacements made.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Document identifier (use "1")' },
      find: { type: 'string', description: 'Text to find (case-insensitive by default)' },
      replace: { type: 'string', description: 'Replacement text' },
      caseSensitive: { type: 'boolean', description: 'Case-sensitive matching. Default false.' },
    },
    required: ['documentId', 'find', 'replace'],
  },
  handler: async (args) => {
    const find = String(args.find ?? '')
    const replace = String(args.replace ?? '')
    if (!find) return err('find cannot be empty')

    const caseSensitive = args.caseSensitive === true
    const flags = caseSensitive ? 'g' : 'gi'
    const regex = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags)

    let replacements = 0

    for (const section of wordoStore.getDocument().sections) {
      for (const block of section.blocks) {
        if (block.type === 'paragraph' || block.type === 'heading' ||
            block.type === 'list_item' || block.type === 'blockquote') {
          for (const inline of block.content) {
            const before = inline.text
            inline.text = inline.text.replace(regex, replace)
            if (inline.text !== before) {
              const matchCount = (before.match(regex) ?? []).length
              replacements += matchCount
            }
          }
        } else if (block.type === 'code_block') {
          const before = block.content
          block.content = block.content.replace(regex, replace)
          if (block.content !== before) {
            const matchCount = (before.match(regex) ?? []).length
            replacements += matchCount
          }
        }
      }
    }

    if (replacements > 0) {
      wordoStore.getDocument().updatedAt = new Date().toISOString()
      broadcast('wordo:content_updated', { documentId: '1' })
    }

    return json({ find, replace, replacements, caseSensitive })
  },
}

const wordo_export_markdown: McpToolDefinition = {
  name: 'wordo_export_markdown',
  module: 'wordo',
  version: '1.0.0',
  description: 'Export the entire document as a Markdown string.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Document identifier (use "1")' },
    },
    required: ['documentId'],
  },
  handler: async () => {
    return { content: [{ type: 'text', text: wordoStore.exportMarkdown(), mimeType: 'text/markdown' }] }
  },
}

const wordo_import_markdown: McpToolDefinition = {
  name: 'wordo_import_markdown',
  module: 'wordo',
  version: '1.0.0',
  description: 'Replace the current document by importing Markdown text. All existing content is replaced.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Document identifier (use "1")' },
      markdown: { type: 'string', description: 'Markdown text to import' },
      title: { type: 'string', description: 'New document title (optional, preserves existing title if omitted)' },
    },
    required: ['documentId', 'markdown'],
  },
  handler: async (args) => {
    const md = String(args.markdown ?? '')
    if (!md.trim()) return err('markdown cannot be empty')
    const title = args.title ? String(args.title) : undefined
    const doc = wordoStore.importMarkdown(md, title)
    broadcast('wordo:document_replaced', { documentId: '1' })
    return json({ documentId: '1', title: doc.title, sectionCount: doc.sections.length, blockCount: doc.sections.reduce((n, s) => n + s.blocks.length, 0) })
  },
}

const wordo_set_title: McpToolDefinition = {
  name: 'wordo_set_title',
  module: 'wordo',
  version: '1.0.0',
  description: 'Set the document title.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Document identifier (use "1")' },
      title: { type: 'string', description: 'New document title' },
    },
    required: ['documentId', 'title'],
  },
  handler: async (args) => {
    const title = String(args.title ?? '').trim()
    if (!title) return err('title cannot be empty')
    wordoStore.setDocument({ title })
    broadcast('wordo:content_updated', { documentId: '1' })
    return json({ documentId: '1', title })
  },
}

// ─── Export ───────────────────────────────────────────────────────────────────

export const wordoTools: McpToolDefinition[] = [
  // Read
  wordo_read_document,
  wordo_read_section,
  wordo_get_outline,
  wordo_find_text,
  // Write
  wordo_write_block,
  wordo_insert_paragraph,
  wordo_delete_block,
  wordo_replace_text,
  wordo_export_markdown,
  wordo_import_markdown,
  wordo_set_title,
]
