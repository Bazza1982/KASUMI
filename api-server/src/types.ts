// ─── NEXCEL TYPES ───────────────────────────────────────────────────────────

export type FieldType =
  | 'text' | 'long_text' | 'number' | 'boolean' | 'date'
  | 'email' | 'url' | 'phone_number'
  | 'single_select' | 'multiple_select'
  | 'formula' | 'created_on' | 'last_modified'

export interface SelectOption {
  id: number
  value: string
  color: string
}

export interface FieldMeta {
  id: number
  name: string
  type: FieldType
  order: number
  primary: boolean
  readOnly: boolean
  numberDecimalPlaces?: number
  dateFormat?: string
  dateIncludeTime?: boolean
  selectOptions?: SelectOption[]
}

export interface RowRecord {
  id: number
  order: string
  fields: Record<number, unknown>
  createdAt: string
  updatedAt: string
}

export interface CellFormat {
  bold?: boolean
  italic?: boolean
  align?: 'left' | 'center' | 'right'
  bgColor?: string
  textColor?: string
}

export interface ConditionalFormatRule {
  id: string
  fieldId: number
  condition: 'equals' | 'contains' | 'gt' | 'lt' | 'is_empty'
  value: string
  bgColor?: string
  textColor?: string
  bold?: boolean
}

export interface SortConfig {
  fieldId: number
  direction: 'asc' | 'desc'
}

export interface FilterRule {
  fieldId: number
  type: 'contains' | 'equals' | 'is_empty' | 'not_empty' | 'gt' | 'lt'
  value: string
}

// ─── WORDO TYPES ─────────────────────────────────────────────────────────────

export interface InlineContent {
  text: string
  marks?: {
    bold?: boolean
    italic?: boolean
    underline?: boolean
    strikethrough?: boolean
    code?: boolean
    link?: string
    highlight?: string
    fontColor?: string
    fontSize?: string
  }
}

export type AnyBlock =
  | ParagraphBlock
  | HeadingBlock
  | ListItemBlock
  | TableBlock
  | CodeBlock
  | BlockquoteBlock
  | PageBreakBlock
  | NexcelEmbedBlock

export interface ParagraphBlock {
  type: 'paragraph'
  id: string
  content: InlineContent[]
  align?: 'left' | 'center' | 'right' | 'justify'
}

export interface HeadingBlock {
  type: 'heading'
  id: string
  level: 1 | 2 | 3 | 4 | 5 | 6
  content: InlineContent[]
}

export interface ListItemBlock {
  type: 'list_item'
  id: string
  listType: 'bullet' | 'ordered'
  level: number
  content: InlineContent[]
}

export interface TableBlock {
  type: 'table'
  id: string
  rows: TableRowData[]
}

export interface TableRowData {
  cells: TableCellData[]
}

export interface TableCellData {
  content: InlineContent[]
  header?: boolean
}

export interface CodeBlock {
  type: 'code_block'
  id: string
  content: string
  language?: string
}

export interface BlockquoteBlock {
  type: 'blockquote'
  id: string
  content: InlineContent[]
}

export interface PageBreakBlock {
  type: 'page_break'
  id: string
}

export interface NexcelEmbedBlock {
  type: 'nexcel_embed'
  id: string
  sourceObjectId: string
  mode: 'snapshot' | 'linked'
  caption?: string
  snapshotData?: unknown
}

export interface PageStyle {
  size: 'A4' | 'A3' | 'Letter' | 'Legal'
  orientation: 'portrait' | 'landscape'
  margins: { top: number; bottom: number; left: number; right: number }
}

export interface WatermarkConfig {
  enabled: boolean
  text: string
  opacity: number
  angle: number
}

export interface DocumentSection {
  id: string
  pageStyle: PageStyle
  watermark?: WatermarkConfig
  header?: string
  footer?: string
  blocks: AnyBlock[]
}

export interface KasumiDocument {
  id: string
  title: string
  sections: DocumentSection[]
  createdAt: string
  updatedAt: string
}

export interface Comment {
  id: string
  sectionId: string
  blockId?: string
  anchorText: string
  text: string
  author: string
  resolved: boolean
  createdAt: string
}

export interface TrackChange {
  id: string
  type: 'insert' | 'delete'
  sectionId: string
  blockId: string
  content: string
  author: string
  timestamp: string
}

// ─── API RESPONSE TYPES ───────────────────────────────────────────────────────

export interface ApiSuccess<T = unknown> {
  ok: true
  data: T
}

export interface ApiError {
  ok: false
  error: string
  code: number
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError
