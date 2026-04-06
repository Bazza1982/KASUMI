import { v4 as uuidv4 } from 'uuid'
import { wordoStore } from '../store/wordoStore'
import type {
  AnyBlock,
  HeaderFooterContent,
  InlineContent,
  PageStyle,
  WatermarkConfig,
} from '../types'

export type WordoLayoutImpact = 'none' | 'local' | 'multi_page' | 'whole_section'
export type WordoCommandSource = 'api' | 'mcp' | 'ai' | 'user'

export interface WordoCommandSpec {
  type: string
  description: string
  payload: string[]
  layoutImpact: WordoLayoutImpact
}

export interface WordoMcpToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, { type: string; description?: string }>
    required: string[]
    additionalProperties: boolean
  }
  annotations: {
    shell: 'wordo'
    commandType: string
    layoutImpact: WordoLayoutImpact
  }
}

export interface WordoCommandResult {
  operationId: string
  changedObjectIds: string[]
  layoutImpact: WordoLayoutImpact
  warnings: Array<{ code: string; message: string }>
  idMapping: Array<{ from: string; to: string }>
}

export interface WordoCommandAuditEntry {
  operationId: string
  commandType: string
  sectionId?: string
  blockId?: string
  source: WordoCommandSource
  timestamp: string
  success: boolean
  description?: string
  changedObjectIds: string[]
  layoutImpact?: WordoLayoutImpact
  warnings: Array<{ code: string; message: string }>
  idMapping: Array<{ from: string; to: string }>
  error?: string
}

export interface WordoCommandAuditExport {
  schemaVersion: 1
  exportedAt: string
  document: {
    id: string
    title: string
    sectionCount: number
    updatedAt?: string
  }
  summary: {
    totalCommands: number
    successCount: number
    failureCount: number
    sourceCounts: Record<string, number>
    commandTypeCounts: Record<string, number>
    layoutImpactCounts: Record<string, number>
  }
  entries: WordoCommandAuditEntry[]
}

export const WORDO_COMMAND_SPECS: WordoCommandSpec[] = [
  { type: 'insert_block', description: 'Insert a new block into a target section.', payload: ['sectionId', 'afterBlockId', 'block'], layoutImpact: 'local' },
  { type: 'delete_block', description: 'Delete an existing block from a section.', payload: ['sectionId', 'blockId'], layoutImpact: 'local' },
  { type: 'update_block', description: 'Patch block text or paragraph-level layout attrs without replacing the whole section.', payload: ['sectionId', 'blockId', 'patch'], layoutImpact: 'local' },
  { type: 'rewrite_block', description: 'Replace a block text body with plain text.', payload: ['sectionId', 'blockId', 'newText'], layoutImpact: 'local' },
  { type: 'set_page_style', description: 'Update page size, margins, orientation, or first/odd-even flags for one section.', payload: ['sectionId', 'pageStyle'], layoutImpact: 'whole_section' },
  { type: 'set_header', description: 'Set header content for a section.', payload: ['sectionId', 'header'], layoutImpact: 'whole_section' },
  { type: 'set_footer', description: 'Set footer content for a section.', payload: ['sectionId', 'footer'], layoutImpact: 'whole_section' },
  { type: 'set_watermark', description: 'Set watermark config for a section.', payload: ['sectionId', 'watermark'], layoutImpact: 'whole_section' },
  { type: 'insert_section', description: 'Insert a new section before or after an existing section.', payload: ['afterSectionId'], layoutImpact: 'whole_section' },
  { type: 'delete_section', description: 'Delete one section.', payload: ['sectionId'], layoutImpact: 'whole_section' },
]

function inferJsonSchemaType(field: string): string {
  if (field.endsWith('Id')) return 'string'
  if (['pageStyle', 'header', 'footer', 'watermark', 'patch', 'block'].includes(field)) return 'object'
  if (field.startsWith('after')) return 'string|null'
  if (field === 'newText') return 'string'
  return 'string'
}

function makeResult(
  changedObjectIds: string[],
  layoutImpact: WordoLayoutImpact,
  warnings: WordoCommandResult['warnings'] = [],
  idMapping: WordoCommandResult['idMapping'] = [],
): WordoCommandResult {
  return {
    operationId: uuidv4(),
    changedObjectIds,
    layoutImpact,
    warnings,
    idMapping,
  }
}

function parseToolName(toolName: string): string {
  if (!toolName.startsWith('wordo.')) {
    throw new Error(`Unsupported Wordo MCP tool: ${toolName}`)
  }

  return toolName.slice('wordo.'.length)
}

function patchTextContent(block: AnyBlock, text: string): Partial<AnyBlock> {
  if (block.type === 'paragraph' || block.type === 'blockquote' || block.type === 'list_item') {
    return { content: [{ text }] as InlineContent[] }
  }
  if (block.type === 'heading') {
    return { content: [{ text }] as InlineContent[] }
  }
  if (block.type === 'code_block') {
    return { content: text }
  }

  throw new Error(`Block type "${block.type}" does not support text editing`)
}

function recordAudit(entry: WordoCommandAuditEntry): void {
  wordoStore.commandAudit.push(entry)
}

function requireSection(sectionId: unknown) {
  const id = String(sectionId ?? '')
  const section = wordoStore.getSection(id)
  if (!section) {
    throw new Error(`Section not found: ${id}`)
  }

  return section
}

function requireBlock(blockId: unknown) {
  const id = String(blockId ?? '')
  const found = wordoStore.findBlock(id)
  if (!found) {
    throw new Error(`Block not found: ${id}`)
  }

  return found
}

export function getWordoCommandSurface(): WordoCommandSpec[] {
  return WORDO_COMMAND_SPECS
}

export function getWordoSemanticToolDefinitions(): WordoMcpToolDefinition[] {
  return WORDO_COMMAND_SPECS.map(spec => ({
    name: `wordo.${spec.type}`,
    description: spec.description,
    inputSchema: {
      type: 'object',
      properties: Object.fromEntries(spec.payload.map(field => [field, {
        type: inferJsonSchemaType(field),
        description: `${field} for ${spec.type}`,
      }])),
      required: spec.payload.filter(field => !field.startsWith('after')),
      additionalProperties: false,
    },
    annotations: {
      shell: 'wordo',
      commandType: spec.type,
      layoutImpact: spec.layoutImpact,
    },
  }))
}

export function executeWordoSemanticCommand(
  type: string,
  payload: Record<string, unknown>,
  source: WordoCommandSource = 'api',
  description?: string,
): { success: true; commandResult: WordoCommandResult } | { success: false; error: string; commandResult?: WordoCommandResult } {
  const auditBase = {
    operationId: uuidv4(),
    commandType: type,
    sectionId: typeof payload.sectionId === 'string' ? payload.sectionId : undefined,
    blockId: typeof payload.blockId === 'string' ? payload.blockId : undefined,
    source,
    timestamp: new Date().toISOString(),
    description,
  }

  try {
    let result: WordoCommandResult

    switch (type) {
      case 'insert_block': {
        requireSection(payload.sectionId)
        const sectionId = String(payload.sectionId)
        const rawBlock = payload.block
        if (!rawBlock || typeof rawBlock !== 'object') {
          throw new Error('block payload required')
        }
        const { id: _ignored, ...blockWithoutId } = rawBlock as Record<string, unknown>
        const inserted = wordoStore.insertBlock(sectionId, blockWithoutId as Omit<AnyBlock, 'id'>, typeof payload.afterBlockId === 'string' ? payload.afterBlockId : undefined)
        result = makeResult([sectionId, inserted.id], 'local')
        break
      }
      case 'delete_block': {
        requireSection(payload.sectionId)
        const blockId = String(payload.blockId ?? '')
        const deleted = wordoStore.deleteBlock(blockId)
        if (!deleted) {
          throw new Error(`Block not found: ${blockId}`)
        }
        result = makeResult([String(payload.sectionId), blockId], 'local')
        break
      }
      case 'rewrite_block': {
        requireSection(payload.sectionId)
        const found = requireBlock(payload.blockId)
        const patch = patchTextContent(found.block, String(payload.newText ?? ''))
        wordoStore.updateBlock(found.block.id, patch)
        result = makeResult([String(payload.sectionId), found.block.id], 'local')
        break
      }
      case 'update_block': {
        requireSection(payload.sectionId)
        const found = requireBlock(payload.blockId)
        const patch = (payload.patch ?? {}) as Record<string, unknown>
        const warnings: WordoCommandResult['warnings'] = []
        const appliedPatch: Record<string, unknown> = {}

        if (typeof patch.text === 'string') {
          Object.assign(appliedPatch, patchTextContent(found.block, patch.text))
        }
        if (Array.isArray(patch.content)) {
          appliedPatch.content = patch.content
        }
        if (patch.alignment !== undefined) appliedPatch.align = patch.alignment
        if (patch.indentLevel !== undefined) appliedPatch.indentLevel = patch.indentLevel
        if (patch.lineSpacing !== undefined) appliedPatch.lineSpacing = patch.lineSpacing
        if (patch.spaceBefore !== undefined) appliedPatch.spaceBefore = patch.spaceBefore
        if (patch.spaceAfter !== undefined) appliedPatch.spaceAfter = patch.spaceAfter
        if (patch.pageBreakBefore !== undefined) appliedPatch.pageBreakBefore = patch.pageBreakBefore
        if (patch.level !== undefined && found.block.type === 'heading') appliedPatch.level = patch.level

        if (patch.styleId !== undefined) {
          warnings.push({ code: 'unsupported_style_id', message: 'styleId is not implemented on the server store yet.' })
        }
        if (patch.layoutProps !== undefined) {
          warnings.push({ code: 'unsupported_layout_props', message: 'layoutProps is not implemented on the server store yet.' })
        }
        if (patch.listType !== undefined) {
          warnings.push({ code: 'unsupported_list_type', message: 'listType patch is not implemented on the server store yet.' })
        }

        wordoStore.updateBlock(found.block.id, appliedPatch as Partial<AnyBlock>)
        result = makeResult([String(payload.sectionId), found.block.id], 'local', warnings)
        break
      }
      case 'set_page_style': {
        const section = requireSection(payload.sectionId)
        const pageStyle = payload.pageStyle as Partial<PageStyle>
        wordoStore.updateSectionPageStyle(section.id, pageStyle)
        result = makeResult([section.id], 'whole_section')
        break
      }
      case 'set_header': {
        const section = requireSection(payload.sectionId)
        wordoStore.updateSectionHeaderFooter(section.id, 'header', payload.header as string | HeaderFooterContent | undefined)
        result = makeResult([section.id], 'whole_section')
        break
      }
      case 'set_footer': {
        const section = requireSection(payload.sectionId)
        wordoStore.updateSectionHeaderFooter(section.id, 'footer', payload.footer as string | HeaderFooterContent | undefined)
        result = makeResult([section.id], 'whole_section')
        break
      }
      case 'set_watermark': {
        const section = requireSection(payload.sectionId)
        wordoStore.updateSectionWatermark(section.id, payload.watermark as WatermarkConfig | undefined)
        result = makeResult([section.id], 'whole_section')
        break
      }
      case 'insert_section': {
        const section = wordoStore.addSection(typeof payload.afterSectionId === 'string' ? payload.afterSectionId : undefined)
        result = makeResult([section.id], 'whole_section')
        break
      }
      case 'delete_section': {
        const sectionId = String(payload.sectionId ?? '')
        const deleted = wordoStore.deleteSection(sectionId)
        if (!deleted) {
          throw new Error('Section not found or cannot delete last section')
        }
        result = makeResult([sectionId], 'whole_section')
        break
      }
      default:
        throw new Error(`Unknown Wordo command type: ${type}`)
    }

    recordAudit({
      ...auditBase,
      operationId: result.operationId,
      success: true,
      changedObjectIds: result.changedObjectIds,
      layoutImpact: result.layoutImpact,
      warnings: result.warnings,
      idMapping: result.idMapping,
    })

    return { success: true, commandResult: result }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    recordAudit({
      ...auditBase,
      success: false,
      changedObjectIds: [],
      warnings: [],
      idMapping: [],
      error: message,
    })
    return { success: false, error: message }
  }
}

export function executeWordoSemanticTool(
  toolName: string,
  args: Record<string, unknown>,
  source: WordoCommandSource = 'mcp',
): { success: true; commandResult: WordoCommandResult } | { success: false; error: string; commandResult?: WordoCommandResult } {
  return executeWordoSemanticCommand(parseToolName(toolName), args, source, `Executed via ${toolName}`)
}

export function summarizeWordoCommandAudit(entries: WordoCommandAuditEntry[]): WordoCommandAuditExport['summary'] {
  const summary: WordoCommandAuditExport['summary'] = {
    totalCommands: entries.length,
    successCount: 0,
    failureCount: 0,
    sourceCounts: {},
    commandTypeCounts: {},
    layoutImpactCounts: {},
  }

  for (const entry of entries) {
    if (entry.success) summary.successCount += 1
    else summary.failureCount += 1

    summary.sourceCounts[entry.source] = (summary.sourceCounts[entry.source] ?? 0) + 1
    summary.commandTypeCounts[entry.commandType] = (summary.commandTypeCounts[entry.commandType] ?? 0) + 1

    if (entry.layoutImpact) {
      summary.layoutImpactCounts[entry.layoutImpact] = (summary.layoutImpactCounts[entry.layoutImpact] ?? 0) + 1
    }
  }

  return summary
}

export function exportWordoCommandAudit(): WordoCommandAuditExport {
  const entries = wordoStore.commandAudit as unknown as WordoCommandAuditEntry[]
  const doc = wordoStore.getDocument()

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    document: {
      id: doc.id,
      title: doc.title,
      sectionCount: doc.sections.length,
      updatedAt: doc.updatedAt,
    },
    summary: summarizeWordoCommandAudit(entries),
    entries,
  }
}

export function clearWordoCommandAudit(): void {
  wordoStore.commandAudit = []
}
