// ============================================================
// KASUMI WORDO — Canonical Document IR (Internal Representation)
// This is the source of truth. .docx / .pdf are export formats.
// AI and user commands operate against this model, never raw DOM.
// ============================================================

import type { WorkspaceObjectId } from '../../../platform/types'

// ── IDs ─────────────────────────────────────────────────────
export type SemanticObjectId = string
export type DocumentId = SemanticObjectId
export type SectionId = SemanticObjectId
export type BlockId = SemanticObjectId
export type StyleId = SemanticObjectId
export type AssetId = SemanticObjectId
export type WarningId = SemanticObjectId
export type OperationId = SemanticObjectId
export type LegacyPath = string

// ── Runtime helpers ─────────────────────────────────────────
function randomId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return `${prefix}_${uuid}`
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function createSemanticId(prefix = 'obj'): SemanticObjectId {
  return randomId(prefix)
}

export function createOperationId(prefix = 'op'): OperationId {
  return randomId(prefix)
}

export function buildLegacyPath(...segments: Array<string | number | null | undefined>): LegacyPath {
  return segments
    .filter((segment): segment is string | number => segment !== null && segment !== undefined && segment !== '')
    .map(segment => String(segment).replace(/\//g, '_'))
    .join('/')
}

export function createFingerprint(input: string): string {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fp_${(hash >>> 0).toString(16).padStart(8, '0')}`
}

// ── Diagnostics / provenance ────────────────────────────────
export type ProvenanceSource = 'import' | 'user' | 'ai' | 'system'
export type WarningSeverity = 'info' | 'warn' | 'error'
export type ImportSupportLevel =
  | 'full'
  | 'preserved_read_only'
  | 'degraded_with_warning'
  | 'unsupported_but_retained_reference'

export interface SourceLocation {
  layer?: 'docx' | 'semantic' | 'render' | 'mcp'
  path?: string
  pageIndex?: number
  line?: number
  column?: number
}

export interface SemanticObjectProvenance {
  source: ProvenanceSource
  createdAt: string
  createdBy?: string
  lastModifiedAt?: string
  lastModifiedBy?: string
  lastOperationId?: OperationId
  parentIds?: SemanticObjectId[]
  replacedBy?: SemanticObjectId[]
  importFingerprint?: string
  importLegacyPath?: LegacyPath
}

export interface DocumentWarning {
  id: WarningId
  severity: WarningSeverity
  code: string
  message: string
  objectId?: SemanticObjectId
  sourceLocation?: SourceLocation
}

export function createProvenance(
  source: ProvenanceSource,
  overrides: Partial<SemanticObjectProvenance> = {},
): SemanticObjectProvenance {
  const now = new Date().toISOString()
  return {
    source,
    createdAt: now,
    lastModifiedAt: now,
    ...overrides,
  }
}

export function createDocumentWarning(
  code: string,
  message: string,
  overrides: Partial<DocumentWarning> = {},
): DocumentWarning {
  return {
    id: createSemanticId('warn'),
    severity: 'warn',
    code,
    message,
    ...overrides,
  }
}

export interface SemanticIdentity {
  id: SemanticObjectId
  fingerprint?: string
  legacyPath?: LegacyPath
  supportLevel?: ImportSupportLevel
  provenance?: SemanticObjectProvenance
  warnings?: DocumentWarning[]
}

export interface ObjectReference {
  objectId: SemanticObjectId
  kind?: string
}

// ── Page / Layout ────────────────────────────────────────────
export type PaperSize = 'A4' | 'A3' | 'Letter' | 'Legal'
export type Orientation = 'portrait' | 'landscape'

export interface PageMargins {
  top: number
  bottom: number
  left: number
  right: number
  header: number
  footer: number
}

export interface PageStyle extends SemanticIdentity {
  id: StyleId
  size: PaperSize
  orientation: Orientation
  margins: PageMargins
  differentFirstPage: boolean
  differentOddEven: boolean
}

export interface PageDimensions {
  width: number
  height: number
  unit: 'mm' | 'px'
}

export interface BoxRegion {
  top: number
  left: number
  width: number
  height: number
  unit: 'mm' | 'px'
}

export interface PageModel {
  pageIndex: number
  sectionId: SectionId
  dimensions: PageDimensions
  marginBox: BoxRegion
  headerRegion: BoxRegion
  footerRegion: BoxRegion
  bodyRegion: BoxRegion
  objectRefs: ObjectReference[]
}

export interface ObjectRenderFragment {
  objectId: SemanticObjectId
  pageIndex: number
  fragmentIndex: number
  bounds: BoxRegion
  textRange?: {
    startRunId?: SemanticObjectId
    startOffset?: number
    endRunId?: SemanticObjectId
    endOffset?: number
  }
}

export interface PageMapEntry {
  pageIndex: number
  objectIds: SemanticObjectId[]
}

export interface SelectionTextPosition {
  blockId: BlockId
  runId?: SemanticObjectId
  offset: number
}

export interface SelectionRange {
  start: SelectionTextPosition
  end: SelectionTextPosition
}

export interface BlockSelectionTarget {
  blockId: BlockId
}

export interface ImageSelectionTarget {
  imageId: BlockId
}

export interface TableSelectionTarget {
  tableId: BlockId
  cellId: SemanticObjectId
  blockId?: BlockId
  runId?: SemanticObjectId
  offset?: number
}

export interface SelectionMapEntry {
  anchorId: string
  pageIndex: number
  target: SelectionTextPosition | SelectionRange | BlockSelectionTarget | ImageSelectionTarget | TableSelectionTarget
}

export interface PaginationSnapshot {
  pages: PageModel[]
  pageMap: PageMapEntry[]
  objectRenderMap: ObjectRenderFragment[]
  selectionMap: SelectionMapEntry[]
  renderWarnings: DocumentWarning[]
}

export interface FidelityScoreBreakdown {
  objectCoverage: number
  textCoverage: number
  textLengthCoverage: number
  imageCoverage: number
  tableCoverage: number
  sectionSupport: number
  warningPenalty: number
}

export interface FidelitySnapshot {
  overallScore: number
  grade: 'high' | 'medium' | 'low'
  sourceBlockCount: number
  renderedObjectCount: number
  sourceTextBlockCount: number
  renderedTextBlockCount: number
  sourceTextLength: number
  renderedTextLength: number
  sourceImageCount: number
  renderedImageCount: number
  sourceTableCount: number
  renderedTableCount: number
  pageCount: number
  warningCount: number
  breakdown: FidelityScoreBreakdown
}

// ── Watermark ────────────────────────────────────────────────
export interface WatermarkConfig {
  text?: string
  imageUrl?: string
  opacity: number
  angle: number
  enabled: boolean
}

// ── Styles ───────────────────────────────────────────────────
export type StyleType = 'paragraph' | 'character' | 'table' | 'page' | 'numbering'

export interface StyleDef extends SemanticIdentity {
  id: StyleId
  name: string
  type: StyleType
  basedOn?: StyleId
  props: Record<string, string | number | boolean>
}

// ── Inline formatting ────────────────────────────────────────
export type InlineMarkType =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'code'
  | 'superscript'
  | 'subscript'
  | 'link'
  | 'char_style'

export interface InlineMark {
  type: InlineMarkType
  attrs?: Record<string, string>
}

export interface Run extends SemanticIdentity {
  id: SemanticObjectId
  text: string
  marks: InlineMark[]
  charFormat?: Record<string, string | number | boolean>
  hyperlink?: string
  fieldCode?: string
}

// Backward compatibility alias while the old editing stack still uses this name.
export type InlineSpan = Run

// ── Numbering / assets ───────────────────────────────────────
export interface NumberingLevelDefinition {
  level: number
  format: string
  textPattern?: string
  indentLeft?: number
  indentHanging?: number
}

export interface NumberingDefinition extends SemanticIdentity {
  id: SemanticObjectId
  levels: NumberingLevelDefinition[]
  format: 'bullet' | 'decimal' | 'roman' | 'alpha' | 'custom'
  indentRules?: Record<string, number>
}

export interface Asset extends SemanticIdentity {
  id: AssetId
  mimeType: string
  src: string
  originalFilename?: string
  altText?: string
  sizeBytes?: number
}

// ── Blocks ───────────────────────────────────────────────────
export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'list_item'
  | 'table'
  | 'image'
  | 'image_block'
  | 'horizontal_rule'
  | 'page_break'
  | 'section_break'
  | 'text_box'
  | 'floating_object'
  | 'footnote_block'
  | 'comment_anchor'
  | 'nexcel_embed'
  | 'data_binding'

export interface BaseBlock extends SemanticIdentity {
  id: BlockId
  type: BlockType
  styleId?: StyleId
  layoutProps?: Record<string, string | number | boolean>
  anchor?: {
    pageIndex?: number
    x?: number
    y?: number
  }
}

export interface ParagraphFormat {
  alignment: 'left' | 'center' | 'right' | 'justify'
  indentLevel: number
  lineSpacing: number
  spaceBefore: number
  spaceAfter: number
}

export interface ParagraphBlock extends BaseBlock, ParagraphFormat {
  type: 'paragraph'
  content: Run[]
  bookmarkIds?: string[]
}

export interface HeadingBlock extends BaseBlock {
  type: 'heading'
  level: 1 | 2 | 3 | 4 | 5 | 6
  content: Run[]
  paragraphFormat?: Partial<ParagraphFormat>
}

export interface ListItemBlock extends BaseBlock {
  type: 'list_item'
  listType: 'bullet' | 'ordered'
  level: number
  content: Run[]
  listRef?: SemanticObjectId
  paragraphFormat?: Partial<ParagraphFormat>
}

export interface TableCell extends SemanticIdentity {
  id: SemanticObjectId
  rowSpan: number
  colSpan: number
  content: ParagraphBlock[]
  cellFormat?: Record<string, string | number | boolean>
}

export interface TableRow extends SemanticIdentity {
  id: SemanticObjectId
  cells: TableCell[]
  isHeader: boolean
}

export interface TableBlock extends BaseBlock {
  type: 'table'
  rows: TableRow[]
  styleId?: StyleId
  tableFormat?: Record<string, string | number | boolean>
}

export interface ImageBlock extends BaseBlock {
  type: 'image' | 'image_block'
  src: string
  alt: string
  widthPct: number
  alignment: 'left' | 'center' | 'right'
  caption?: string
  assetId?: AssetId
  placement?: 'inline' | 'anchored'
  crop?: {
    top?: number
    right?: number
    bottom?: number
    left?: number
  }
  size?: {
    width: number
    height: number
    unit: 'px' | 'mm'
  }
  captionRef?: BlockId
}

export interface PageBreakBlock extends BaseBlock {
  type: 'page_break'
}

export interface SectionBreakBlock extends BaseBlock {
  type: 'section_break'
  breakType?: 'next_page' | 'continuous' | 'odd_page' | 'even_page'
}

export interface NexcelEmbedBlock extends BaseBlock {
  type: 'nexcel_embed'
  sourceObjectId: WorkspaceObjectId
  mode: 'linked' | 'snapshot'
  snapshotData?: { headers: string[]; rows: string[][] }
  snapshotAt?: string
  caption?: string
}

export interface DataBindingBlock extends BaseBlock {
  type: 'data_binding'
  sourceObjectId: WorkspaceObjectId
  fieldId: string
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
  | SectionBreakBlock
  | NexcelEmbedBlock
  | DataBindingBlock

// ── Header / footer / notes ─────────────────────────────────
export type HeaderFooterVariant = 'default' | 'first' | 'even'

export interface HeaderFooterVariantContent {
  pmDocJson?: object
  previewText?: string
}

export interface HeaderFooter extends SemanticIdentity {
  default: AnyBlock[]
  firstPage?: AnyBlock[]
  evenPage?: AnyBlock[]
  pmDocJson?: object
  previewText?: string
  variantDocs?: Partial<Record<HeaderFooterVariant, object>>
  variantPreviewText?: Partial<Record<HeaderFooterVariant, string>>
  linkToPrevious?: Partial<Record<HeaderFooterVariant, boolean>>
}

export interface Footnote extends SemanticIdentity {
  id: SemanticObjectId
  anchorBlockId: BlockId
  content: ParagraphBlock[]
}

// ── Sections / document ─────────────────────────────────────
export interface SectionBreakSpec {
  type?: 'next_page' | 'continuous' | 'odd_page' | 'even_page'
}

export interface DocumentSection extends SemanticIdentity {
  id: SectionId
  pageStyle: PageStyle
  watermark?: WatermarkConfig
  header?: HeaderFooter
  footer?: HeaderFooter
  blocks: AnyBlock[]
  footnotes: Footnote[]
  blockIds?: BlockId[]
  headerIds?: SemanticObjectId[]
  footerIds?: SemanticObjectId[]
  sectionBreak?: SectionBreakSpec
}

export interface DocumentMetadata {
  title: string
  importSource?: 'docx' | 'json' | 'manual'
  originalFilename?: string
  importedAt?: string
}

export interface KasumiDocument extends SemanticIdentity {
  id: DocumentId
  title: string
  metadata?: DocumentMetadata
  styleRegistry: StyleDef[]
  defaultPageStyle: PageStyle
  sections: DocumentSection[]
  styles?: StyleDef[]
  numbering?: NumberingDefinition[]
  assets?: Asset[]
  warnings?: DocumentWarning[]
  pagination?: PaginationSnapshot
  fidelity?: FidelitySnapshot
  createdAt: string
  updatedAt: string
}

export function createDefaultPageStyle(overrides: Partial<PageStyle> = {}): PageStyle {
  return {
    id: createSemanticId('page_style'),
    size: 'A4',
    orientation: 'portrait',
    margins: { top: 25, bottom: 25, left: 30, right: 25, header: 12, footer: 12 },
    differentFirstPage: false,
    differentOddEven: false,
    fingerprint: createFingerprint('A4|portrait|25|25|30|25|12|12'),
    provenance: createProvenance('system'),
    ...overrides,
  }
}
