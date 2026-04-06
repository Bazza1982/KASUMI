// ============================================================
// KASUMI WORDO — Command Model
// All mutations (user or AI) pass through typed commands.
// AI must NEVER directly mutate ProseMirror state or the DOM.
// ============================================================

import type {
  SectionId,
  BlockId,
  StyleId,
  AnyBlock,
  Run,
  ParagraphBlock,
  HeadingBlock,
  ListItemBlock,
  PageStyle,
  WatermarkConfig,
  HeaderFooter,
  DocumentWarning,
  OperationId,
  SemanticObjectId,
} from './document'
import type { WorkspaceObjectId } from '../../../platform/types'

// ── Command union ────────────────────────────────────────────
export type WordoCommand =
  | InsertBlockCommand
  | DeleteBlockCommand
  | UpdateBlockCommand
  | ApplyStyleCommand
  | SetHeaderCommand
  | SetFooterCommand
  | SetWatermarkCommand
  | SetPageStyleCommand
  | InsertSectionCommand
  | DeleteSectionCommand
  | InsertNexcelEmbedCommand
  | RefreshNexcelEmbedCommand
  | InsertDataBindingCommand
  | RefreshDataBindingCommand
  | RewriteBlockCommand

interface BaseCommand {
  /** For audit trail */
  fromAI?: boolean
  description?: string
  operationId?: OperationId
}

export interface CommandIdMapping {
  from: SemanticObjectId
  to: SemanticObjectId
}

export interface WordoCommandResult {
  operationId: OperationId
  changedObjectIds: SemanticObjectId[]
  layoutImpact: 'none' | 'local' | 'multi_page' | 'whole_section'
  warnings: DocumentWarning[]
  idMapping: CommandIdMapping[]
  undoPatch?: Record<string, unknown>
}

export interface BlockPatch {
  text?: string
  content?: Run[]
  styleId?: StyleId
  layoutProps?: Record<string, string | number | boolean>
  alignment?: ParagraphBlock['alignment']
  indentLevel?: number
  lineSpacing?: number | string
  spaceBefore?: number | string
  spaceAfter?: number | string
  pageBreakBefore?: boolean
  level?: HeadingBlock['level']
  listType?: ListItemBlock['listType']
}

export interface WordoCommandAuditEntry {
  operationId: OperationId
  commandType: WordoCommand['type']
  sectionId?: SectionId
  blockId?: BlockId
  source: 'ai' | 'user'
  timestamp: string
  success: boolean
  description?: string
  changedObjectIds: SemanticObjectId[]
  layoutImpact?: WordoCommandResult['layoutImpact']
  warnings: DocumentWarning[]
  idMapping: CommandIdMapping[]
  error?: string
}

export interface WordoDocumentCommandSpec {
  type: WordoCommand['type']
  description: string
  payload: string[]
  layoutImpact: WordoCommandResult['layoutImpact']
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
    commandType: WordoCommand['type']
    layoutImpact: WordoCommandResult['layoutImpact']
  }
}

export interface WordoCommandAuditSummary {
  totalCommands: number
  successCount: number
  failureCount: number
  aiCommandCount: number
  userCommandCount: number
  commandTypeCounts: Partial<Record<WordoCommand['type'], number>>
  layoutImpactCounts: Partial<Record<WordoCommandResult['layoutImpact'], number>>
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
  summary: WordoCommandAuditSummary
  entries: WordoCommandAuditEntry[]
}

export interface InsertBlockCommand extends BaseCommand {
  type: 'insert_block'
  sectionId: SectionId
  /** Insert after this block; if null, insert at start */
  afterBlockId: BlockId | null
  block: AnyBlock
}

export interface DeleteBlockCommand extends BaseCommand {
  type: 'delete_block'
  sectionId: SectionId
  blockId: BlockId
}

export interface UpdateBlockCommand extends BaseCommand {
  type: 'update_block'
  sectionId: SectionId
  blockId: BlockId
  /** Partial — only listed keys are updated */
  patch: BlockPatch
}

export interface ApplyStyleCommand extends BaseCommand {
  type: 'apply_style'
  sectionId: SectionId
  blockId: BlockId
  styleId: StyleId
}

export interface SetHeaderCommand extends BaseCommand {
  type: 'set_header'
  sectionId: SectionId
  header: HeaderFooter
}

export interface SetFooterCommand extends BaseCommand {
  type: 'set_footer'
  sectionId: SectionId
  footer: HeaderFooter
}

export interface SetWatermarkCommand extends BaseCommand {
  type: 'set_watermark'
  sectionId: SectionId
  watermark: WatermarkConfig
}

export interface SetPageStyleCommand extends BaseCommand {
  type: 'set_page_style'
  sectionId: SectionId
  pageStyle: Partial<PageStyle>
}

export interface InsertSectionCommand extends BaseCommand {
  type: 'insert_section'
  /** Insert after this section; null = insert at start */
  afterSectionId: SectionId | null
}

export interface DeleteSectionCommand extends BaseCommand {
  type: 'delete_section'
  sectionId: SectionId
}

export interface InsertNexcelEmbedCommand extends BaseCommand {
  type: 'insert_nexcel_embed'
  sectionId: SectionId
  afterBlockId: BlockId | null
  sourceObjectId: WorkspaceObjectId
  mode: 'linked' | 'snapshot'
  caption?: string
}

export interface RefreshNexcelEmbedCommand extends BaseCommand {
  type: 'refresh_nexcel_embed'
  sectionId: SectionId
  blockId: BlockId
}

export interface InsertDataBindingCommand extends BaseCommand {
  type: 'insert_data_binding'
  sectionId: SectionId
  afterBlockId: BlockId | null
  sourceObjectId: WorkspaceObjectId
  fieldId: string
  fallbackText: string
}

export interface RefreshDataBindingCommand extends BaseCommand {
  type: 'refresh_data_binding'
  sectionId: SectionId
  blockId: BlockId
}

export interface RewriteBlockCommand extends BaseCommand {
  type: 'rewrite_block'
  sectionId: SectionId
  blockId: BlockId
  /** New content as plain text — editor will parse into spans */
  newText: string
}
