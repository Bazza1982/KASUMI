/**
 * Phase 4 Wordo MCP tools — page style, section management, Nexcel embed.
 */
import { v4 as uuidv4 } from 'uuid'
import type { McpToolDefinition, McpToolResult } from '../../types'
import { wordoStore } from '../../../store/wordoStore'
import { broadcast } from '../../services/WsServer'
import type { PageStyle, NexcelEmbedBlock } from '../../../types'

function json(data: unknown): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

function err(msg: string): McpToolResult {
  return { content: [{ type: 'text', text: msg }], isError: true }
}

// ─── wordo_set_page_style ─────────────────────────────────────────────────────

const wordo_set_page_style: McpToolDefinition = {
  name: 'wordo_set_page_style',
  module: 'wordo',
  version: '1.0.0',
  description: 'Set the page style (size, orientation, margins) for a document section.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Document identifier (use "1")' },
      sectionId:  { type: 'string', description: 'Section UUID' },
      size:        { type: 'string', description: 'Page size: "A4", "A3", "Letter", or "Legal"', enum: ['A4', 'A3', 'Letter', 'Legal'] },
      orientation: { type: 'string', description: '"portrait" or "landscape"', enum: ['portrait', 'landscape'] },
      marginTop:    { type: 'number', description: 'Top margin in mm (optional)' },
      marginBottom: { type: 'number', description: 'Bottom margin in mm (optional)' },
      marginLeft:   { type: 'number', description: 'Left margin in mm (optional)' },
      marginRight:  { type: 'number', description: 'Right margin in mm (optional)' },
    },
    required: ['documentId', 'sectionId'],
  },
  handler: async (args) => {
    const sectionId = String(args.sectionId ?? '')
    const section = wordoStore.getSection(sectionId)
    if (!section) return err(`Section not found: ${sectionId}`)

    const patch: Partial<PageStyle> = {}
    if (args.size) patch.size = args.size as PageStyle['size']
    if (args.orientation) patch.orientation = args.orientation as PageStyle['orientation']

    if (args.marginTop !== undefined || args.marginBottom !== undefined ||
        args.marginLeft !== undefined || args.marginRight !== undefined) {
      const cur = section.pageStyle.margins
      patch.margins = {
        top:    args.marginTop    !== undefined ? Number(args.marginTop)    : cur.top,
        bottom: args.marginBottom !== undefined ? Number(args.marginBottom) : cur.bottom,
        left:   args.marginLeft   !== undefined ? Number(args.marginLeft)   : cur.left,
        right:  args.marginRight  !== undefined ? Number(args.marginRight)  : cur.right,
      }
    }

    const updated = wordoStore.updateSectionPageStyle(sectionId, patch)
    broadcast('wordo:content_updated', { documentId: '1', sectionId })
    return json({ sectionId, pageStyle: updated?.pageStyle })
  },
}

// ─── wordo_append_section ─────────────────────────────────────────────────────

const wordo_append_section: McpToolDefinition = {
  name: 'wordo_append_section',
  module: 'wordo',
  version: '1.0.0',
  description: 'Append a new section to the document, optionally after a specific section.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Document identifier (use "1")' },
      after: { type: 'string', description: 'Section UUID to insert after (optional; appends at end if omitted)' },
    },
    required: ['documentId'],
  },
  handler: async (args) => {
    const after = args.after ? String(args.after) : undefined
    const section = wordoStore.addSection(after)
    broadcast('wordo:content_updated', { documentId: '1', sectionId: section.id })
    return json({ documentId: '1', section })
  },
}

// ─── wordo_delete_section ─────────────────────────────────────────────────────

const wordo_delete_section: McpToolDefinition = {
  name: 'wordo_delete_section',
  module: 'wordo',
  version: '1.0.0',
  description: 'Delete a section by ID. The last remaining section cannot be deleted.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Document identifier (use "1")' },
      sectionId:  { type: 'string', description: 'Section UUID to delete' },
    },
    required: ['documentId', 'sectionId'],
  },
  handler: async (args) => {
    const sectionId = String(args.sectionId ?? '')
    const deleted = wordoStore.deleteSection(sectionId)
    if (!deleted) return err('Section not found or cannot delete the last section')
    broadcast('wordo:content_updated', { documentId: '1' })
    return json({ deleted: true, sectionId })
  },
}

// ─── wordo_insert_nexcel_embed ────────────────────────────────────────────────

const wordo_insert_nexcel_embed: McpToolDefinition = {
  name: 'wordo_insert_nexcel_embed',
  module: 'wordo',
  version: '1.0.0',
  description: 'Insert a Nexcel spreadsheet embed block into a Wordo document section.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId:    { type: 'string', description: 'Document identifier (use "1")' },
      sectionId:     { type: 'string', description: 'Section UUID to insert into' },
      sourceObjectId: { type: 'string', description: 'Nexcel sheet/object ID to embed (use "1" for the current sheet)' },
      mode:          { type: 'string', description: '"snapshot" (static copy) or "linked" (live link)', enum: ['snapshot', 'linked'] },
      caption:       { type: 'string', description: 'Optional caption text' },
      afterBlockId:  { type: 'string', description: 'Insert after this block ID (optional; appends if omitted)' },
    },
    required: ['documentId', 'sectionId', 'sourceObjectId', 'mode'],
  },
  handler: async (args) => {
    const sectionId = String(args.sectionId ?? '')
    const section = wordoStore.getSection(sectionId)
    if (!section) return err(`Section not found: ${sectionId}`)

    const blockDef: Omit<NexcelEmbedBlock, 'id'> = {
      type: 'nexcel_embed',
      sourceObjectId: String(args.sourceObjectId ?? '1'),
      mode: (args.mode as 'snapshot' | 'linked') ?? 'linked',
      caption: args.caption ? String(args.caption) : undefined,
    }

    const afterBlockId = args.afterBlockId ? String(args.afterBlockId) : undefined
    const inserted = wordoStore.insertBlock(sectionId, blockDef as never, afterBlockId)
    broadcast('wordo:block_inserted', { documentId: '1', sectionId, blockId: inserted.id })
    return json(inserted)
  },
}

// ─── Export ───────────────────────────────────────────────────────────────────

export const wordoModelTools: McpToolDefinition[] = [
  wordo_set_page_style,
  wordo_append_section,
  wordo_delete_section,
  wordo_insert_nexcel_embed,
]
