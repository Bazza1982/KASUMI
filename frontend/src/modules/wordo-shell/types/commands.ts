// ============================================================
// KASUMI WORDO — Command Model
// All mutations (user or AI) pass through typed commands.
// AI must NEVER directly mutate ProseMirror state or the DOM.
// ============================================================

import type { SectionId, BlockId, StyleId, AnyBlock, PageStyle, WatermarkConfig, HeaderFooter } from './document'
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
  patch: Partial<AnyBlock>
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
