// ============================================================
// KASUMI WORDO — Canonical Document IR (Internal Representation)
// This is the source of truth. .docx / .pdf are export formats.
// AI and user commands operate against this model, never raw DOM.
// ============================================================

import type { WorkspaceObjectId } from '../../../platform/types'

// ── IDs ─────────────────────────────────────────────────────
export type DocumentId  = string
export type SectionId   = string
export type BlockId     = string
export type StyleId     = string

// ── Page / Layout ────────────────────────────────────────────
export type PaperSize = 'A4' | 'A3' | 'Letter' | 'Legal'
export type Orientation = 'portrait' | 'landscape'

export interface PageMargins {
  top: number     // mm
  bottom: number
  left: number
  right: number
  header: number
  footer: number
}

export interface PageStyle {
  id: StyleId
  size: PaperSize
  orientation: Orientation
  margins: PageMargins
  /** If set, different header/footer for first page */
  differentFirstPage: boolean
  /** If set, different header/footer for odd/even pages */
  differentOddEven: boolean
}

// ── Watermark ────────────────────────────────────────────────
export interface WatermarkConfig {
  text?: string
  imageUrl?: string
  opacity: number   // 0–1
  angle: number     // degrees
  enabled: boolean
}

// ── Styles ───────────────────────────────────────────────────
export type StyleType = 'paragraph' | 'character' | 'table' | 'page'

export interface StyleDef {
  id: StyleId
  name: string
  type: StyleType
  /** Inherits from another style */
  basedOn?: StyleId
  /** CSS-compatible properties */
  props: Record<string, string | number>
}

// ── Inline Formatting ────────────────────────────────────────
export interface InlineMark {
  type: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code' | 'superscript' | 'subscript' | 'link' | 'char_style'
  /** For link: href. For char_style: styleId */
  attrs?: Record<string, string>
}

export interface InlineSpan {
  text: string
  marks: InlineMark[]
}

// ── Blocks ───────────────────────────────────────────────────
export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'list_item'
  | 'table'
  | 'image'
  | 'horizontal_rule'
  | 'page_break'
  | 'nexcel_embed'    // Linked or snapshot Nexcel table
  | 'data_binding'    // Scalar field binding

export interface BaseBlock {
  id: BlockId
  type: BlockType
  styleId?: StyleId
}

export interface ParagraphBlock extends BaseBlock {
  type: 'paragraph'
  content: InlineSpan[]
  alignment: 'left' | 'center' | 'right' | 'justify'
  indentLevel: number
  lineSpacing: number   // e.g. 1.5
  spaceBefore: number   // pt
  spaceAfter: number    // pt
}

export interface HeadingBlock extends BaseBlock {
  type: 'heading'
  level: 1 | 2 | 3 | 4 | 5 | 6
  content: InlineSpan[]
}

export interface ListItemBlock extends BaseBlock {
  type: 'list_item'
  listType: 'bullet' | 'ordered'
  level: number
  content: InlineSpan[]
}

export interface TableCell {
  id: string
  rowSpan: number
  colSpan: number
  content: ParagraphBlock[]
}

export interface TableRow {
  id: string
  cells: TableCell[]
  isHeader: boolean
}

export interface TableBlock extends BaseBlock {
  type: 'table'
  rows: TableRow[]
  styleId?: StyleId
}

export interface ImageBlock extends BaseBlock {
  type: 'image'
  src: string        // URL or data URI
  alt: string
  widthPct: number   // % of text area width
  alignment: 'left' | 'center' | 'right'
  caption?: string
}

export interface PageBreakBlock extends BaseBlock {
  type: 'page_break'
}

/** Nexcel table embedded in document — live link or frozen snapshot */
export interface NexcelEmbedBlock extends BaseBlock {
  type: 'nexcel_embed'
  /** Workspace object ID pointing to a Nexcel table */
  sourceObjectId: WorkspaceObjectId
  mode: 'linked' | 'snapshot'
  /** Last snapshot data (used in snapshot mode or as fallback) */
  snapshotData?: { headers: string[]; rows: string[][] }
  snapshotAt?: string   // ISO timestamp
  caption?: string
}

/** Inline field value bound to a Nexcel data source */
export interface DataBindingBlock extends BaseBlock {
  type: 'data_binding'
  sourceObjectId: WorkspaceObjectId
  fieldId: string
  /** Displayed when source is unavailable */
  fallbackText: string
  lastValue?: string
}

export type AnyBlock =
  | ParagraphBlock
  | HeadingBlock
  | ListItemBlock
  | TableBlock
  | ImageBlock
  | PageBreakBlock
  | NexcelEmbedBlock
  | DataBindingBlock

// ── Header / Footer ─────────────────────────────────────────
export interface HeaderFooter {
  default: AnyBlock[]
  firstPage?: AnyBlock[]
  evenPage?: AnyBlock[]
}

// ── Footnote ─────────────────────────────────────────────────
export interface Footnote {
  id: string
  /** Block ID where the footnote marker appears */
  anchorBlockId: BlockId
  content: ParagraphBlock[]
}

// ── Section ──────────────────────────────────────────────────
/** A section is the unit of isolation — each maps to one ProseMirror instance */
export interface DocumentSection {
  id: SectionId
  pageStyle: PageStyle
  watermark?: WatermarkConfig
  header?: HeaderFooter
  footer?: HeaderFooter
  /** Ordered content blocks */
  blocks: AnyBlock[]
  footnotes: Footnote[]
}

// ── Document ─────────────────────────────────────────────────
export interface KasumiDocument {
  id: DocumentId
  title: string
  /** Default style set for this document */
  styleRegistry: StyleDef[]
  /** Default page style (overrideable per section) */
  defaultPageStyle: PageStyle
  /** Ordered sections — each rendered as an independent editor instance */
  sections: DocumentSection[]
  createdAt: string   // ISO
  updatedAt: string   // ISO
}
