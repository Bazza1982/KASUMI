// ============================================================
// KASUMI WORDO — .docx Exporter
// Converts ProseMirror document state → .docx via `docx` library.
// ============================================================

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, PageOrientation, SectionType,
  Header, Footer, PageNumber, ExternalHyperlink, HighlightColor,
} from 'docx'
import type { Node as PmNode } from 'prosemirror-model'
import { wordoSchema } from '../editor/schema'
import type { HeaderFooter as HeaderFooterModel, KasumiDocument, PageStyle } from '../types/document'
import type { LayoutOrchestrator } from '../editor/LayoutOrchestrator'

// ── Helpers ──────────────────────────────────────────────────
const mmToTwip = (mm: number) => Math.round(mm * 56.6929)

function cssLengthToTwip(value?: string | number | null): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'number') return Math.round(value * 20)

  const trimmed = value.trim().toLowerCase()
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)(pt|px|mm|cm|in)?$/)
  if (!match) return undefined

  const amount = Number.parseFloat(match[1])
  const unit = match[2] ?? 'pt'
  if (!Number.isFinite(amount)) return undefined

  switch (unit) {
    case 'pt':
      return Math.round(amount * 20)
    case 'px':
      return Math.round(amount * 15)
    case 'mm':
      return mmToTwip(amount)
    case 'cm':
      return mmToTwip(amount * 10)
    case 'in':
      return Math.round(amount * 1440)
    default:
      return undefined
  }
}

function lineSpacingToTwip(value?: string | number | null): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'number') return Math.round(value * 240)

  const trimmed = value.trim().toLowerCase()
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.round(Number.parseFloat(trimmed) * 240)
  }
  return cssLengthToTwip(trimmed)
}

function mapAlignment(value?: string | null): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
  switch ((value ?? '').toLowerCase()) {
    case 'center':
      return AlignmentType.CENTER
    case 'right':
      return AlignmentType.RIGHT
    case 'justify':
      return AlignmentType.JUSTIFIED
    case 'left':
      return AlignmentType.LEFT
    default:
      return undefined
  }
}

function paragraphOptionsFromNode(node: PmNode) {
  return {
    alignment: mapAlignment(node.attrs.textAlign as string | undefined),
    spacing: {
      before: cssLengthToTwip(node.attrs.spaceBefore as string | number | undefined),
      after: cssLengthToTwip(node.attrs.spaceAfter as string | number | undefined) ?? (node.type.name === 'paragraph' ? 120 : undefined),
      line: lineSpacingToTwip(node.attrs.lineSpacing as string | number | undefined),
    },
    indent: {
      left: cssLengthToTwip(node.attrs.indentLeft as string | number | undefined),
      right: cssLengthToTwip(node.attrs.indentRight as string | number | undefined),
      firstLine: cssLengthToTwip(node.attrs.textIndent as string | number | undefined),
    },
    pageBreakBefore: Boolean(node.attrs.pageBreakBefore),
  }
}

function toHeadingLevel(level: number): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
  const map = [
    HeadingLevel.HEADING_1,
    HeadingLevel.HEADING_2,
    HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4,
    HeadingLevel.HEADING_5,
    HeadingLevel.HEADING_6,
  ]
  return map[level - 1] ?? HeadingLevel.HEADING_1
}

function normalizeCssColor(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()

  const hex = trimmed.match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i)?.[1]
  if (hex) {
    return hex.length === 3
      ? hex.split('').map(char => char + char).join('').toUpperCase()
      : hex.toUpperCase()
  }

  const rgb = trimmed.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i)
  if (rgb) {
    return rgb.slice(1, 4).map(component => {
      const value = Math.max(0, Math.min(255, Number.parseInt(component, 10)))
      return value.toString(16).padStart(2, '0')
    }).join('').toUpperCase()
  }

  return undefined
}

function cssSizeToHalfPoints(value?: string | null): number | undefined {
  if (!value) return undefined
  const trimmed = value.trim().toLowerCase()
  const sizeMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)(px|pt)?$/)
  if (!sizeMatch) return undefined

  const size = Number.parseFloat(sizeMatch[1])
  const unit = sizeMatch[2] ?? 'px'
  if (!Number.isFinite(size) || size <= 0) return undefined

  if (unit === 'pt') {
    return Math.round(size * 2)
  }

  return Math.round(size * 1.5)
}

function pmParagraphChildren(node: PmNode): Array<TextRun | ExternalHyperlink> {
  const runs: Array<TextRun | ExternalHyperlink> = []
  node.forEach(child => {
    if (child.type.name === 'hard_break') {
      runs.push(new TextRun({ break: 1 }))
      return
    }

    if (child.isText) {
      const marks = child.marks.map(mark => mark.type.name)
      const fontSize = child.marks.find(mark => mark.type.name === 'font_size')?.attrs?.size
      const fontColor = child.marks.find(mark => mark.type.name === 'font_color')?.attrs?.color
      const link = child.marks.find(mark => mark.type.name === 'link')?.attrs?.href
      const highlight = child.marks.find(mark => mark.type.name === 'highlight')
      const textRun = new TextRun({
        text: child.text ?? '',
        bold: marks.includes('strong'),
        italics: marks.includes('em'),
        underline: marks.includes('underline') ? {} : undefined,
        strike: marks.includes('strikethrough'),
        superScript: marks.includes('superscript'),
        subScript: marks.includes('subscript'),
        size: cssSizeToHalfPoints(fontSize),
        color: normalizeCssColor(fontColor),
        highlight: highlight ? HighlightColor.YELLOW : undefined,
      })

      if (link) {
        runs.push(new ExternalHyperlink({
          link,
          children: [
            new TextRun({
              text: child.text ?? '',
              bold: marks.includes('strong'),
              italics: marks.includes('em'),
              underline: {},
              strike: marks.includes('strikethrough'),
              superScript: marks.includes('superscript'),
              subScript: marks.includes('subscript'),
              size: cssSizeToHalfPoints(fontSize),
              color: normalizeCssColor(fontColor) ?? '0563C1',
              highlight: highlight ? HighlightColor.YELLOW : undefined,
            }),
          ],
        }))
      } else {
        runs.push(textRun)
      }
    }
  })
  return runs.length ? runs : [new TextRun({ text: '' })]
}

function pushListElements(
  listNode: PmNode,
  out: (Paragraph | Table)[],
  listType: 'bullet' | 'ordered',
  level = 0,
): void {
  listNode.forEach(item => {
    item.forEach(child => {
      if (child.type.name === 'paragraph') {
        out.push(new Paragraph({
          bullet: listType === 'bullet' ? { level } : undefined,
          numbering: listType === 'ordered' ? { reference: 'default-numbering', level } : undefined,
          children: pmParagraphChildren(child),
          ...paragraphOptionsFromNode(child),
        }))
        return
      }

      if (child.type.name === 'bullet_list') {
        pushListElements(child, out, 'bullet', level + 1)
        return
      }

      if (child.type.name === 'ordered_list') {
        pushListElements(child, out, 'ordered', level + 1)
      }
    })
  })
}

function pmToDocxElements(node: PmNode): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = []

  node.forEach(child => {
    switch (child.type.name) {

      case 'paragraph':
        out.push(new Paragraph({
          children: pmParagraphChildren(child),
          ...paragraphOptionsFromNode(child),
        }))
        break

      case 'heading':
        out.push(new Paragraph({
          heading: toHeadingLevel(child.attrs['level'] as number),
          children: pmParagraphChildren(child),
          ...paragraphOptionsFromNode(child),
        }))
        break

      case 'bullet_list':
        pushListElements(child, out, 'bullet')
        break

      case 'ordered_list':
        pushListElements(child, out, 'ordered')
        break

      case 'blockquote':
        child.forEach(para => {
          out.push(new Paragraph({
            indent: { left: mmToTwip(12) },
            children: pmParagraphChildren(para),
          }))
        })
        break

      case 'horizontal_rule':
        out.push(new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'E2E8F0', space: 1 } },
          children: [new TextRun({ text: '' })],
        }))
        break

      case 'table': {
        const docxRows: TableRow[] = []
        child.forEach(row => {
          const cells: TableCell[] = []
          row.forEach(cell => {
            const cellParas: Paragraph[] = []
            cell.forEach(p => cellParas.push(new Paragraph({ children: pmParagraphChildren(p), spacing: { after: 60 } })))
            cells.push(new TableCell({
              children: cellParas,
              shading: cell.type.name === 'table_header' ? { fill: 'EEF2FF' } : undefined,
              borders: {
                top:    { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE' },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE' },
                left:   { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE' },
                right:  { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE' },
              },
            }))
          })
          docxRows.push(new TableRow({ children: cells }))
        })
        out.push(new Table({ rows: docxRows, width: { size: 100, type: WidthType.PERCENTAGE } }))
        out.push(new Paragraph({ children: [new TextRun({ text: '' })] }))
        break
      }

      case 'nexcel_embed': {
        const { caption, snapshotData } = child.attrs as {
          caption?: string
          snapshotData?: { headers: string[]; rows: string[][] } | null
        }
        out.push(new Paragraph({
          children: [new TextRun({ text: `[Nexcel Table${caption ? ': ' + caption : ''}]`, bold: true, color: '1A56E8' })],
          spacing: { before: 120, after: 60 },
        }))
        if (snapshotData?.headers.length) {
          const allRows = [snapshotData.headers, ...snapshotData.rows]
          out.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: allRows.map((row, ri) => new TableRow({
              children: row.map(cell => new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: cell, bold: ri === 0 })], spacing: { after: 40 } })],
                shading: ri === 0 ? { fill: 'EEF2FF' } : undefined,
                borders: {
                  top:    { style: BorderStyle.SINGLE, size: 4, color: 'D0E4FF' },
                  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D0E4FF' },
                  left:   { style: BorderStyle.SINGLE, size: 4, color: 'D0E4FF' },
                  right:  { style: BorderStyle.SINGLE, size: 4, color: 'D0E4FF' },
                },
              })),
            })),
          }))
        }
        out.push(new Paragraph({ children: [new TextRun({ text: '' })] }))
        break
      }
    }
  })

  return out
}

// Paper sizes in twips (1 twip = 1/1440 inch)
const PAPER_SIZES: Record<string, { width: number; height: number }> = {
  A4:     { width: 11906, height: 16838 },
  A3:     { width: 16838, height: 23811 },
  Letter: { width: 12240, height: 15840 },
  Legal:  { width: 12240, height: 20160 },
}

function pageSize(ps: PageStyle) {
  const base = PAPER_SIZES[ps.size] ?? PAPER_SIZES['A4']
  const landscape = ps.orientation === 'landscape'
  return {
    width:       landscape ? base.height : base.width,
    height:      landscape ? base.width  : base.height,
    orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
  }
}

function parseHeaderFooterDoc(value?: HeaderFooterModel): PmNode | null {
  if (!value?.pmDocJson) return null
  try {
    return wordoSchema.nodeFromJSON(value.pmDocJson)
  } catch {
    return null
  }
}

function getHeaderFooterVariantDoc(
  value: HeaderFooterModel | undefined,
  variant: 'default' | 'first' | 'even',
): PmNode | null {
  if (!value) return null
  const json = variant === 'default'
    ? value.variantDocs?.default ?? value.pmDocJson
    : value.variantDocs?.[variant]
  if (!json) return null
  try {
    return wordoSchema.nodeFromJSON(json)
  } catch {
    return null
  }
}

function resolveHeaderFooterDoc(
  sections: KasumiDocument['sections'],
  sectionIndex: number,
  zone: 'header' | 'footer',
  variant: 'default' | 'first' | 'even',
): PmNode | null {
  const section = sections[sectionIndex]
  const value = section?.[zone]
  const isFirstSection = sectionIndex === 0
  const linked = !isFirstSection && (value?.linkToPrevious?.[variant] ?? !value)

  if (linked) {
    return resolveHeaderFooterDoc(sections, sectionIndex - 1, zone, variant)
  }

  const directDoc = getHeaderFooterVariantDoc(value, variant)
  if (directDoc) return directDoc
  if (variant !== 'default') return null
  return parseHeaderFooterDoc(value)
}

function buildHeader(
  sections: KasumiDocument['sections'],
  sectionIndex: number,
  title: string,
  variant: 'default' | 'first' | 'even' = 'default',
  usePlaceholder = false,
): Header {
  const doc = resolveHeaderFooterDoc(sections, sectionIndex, 'header', variant)
  const children = doc ? pmToDocxElements(doc) : []
  return new Header({
    children: children.length
      ? children
      : usePlaceholder
        ? [new Paragraph({ children: [new TextRun({ text: title, color: '999999' })] })]
        : [],
  })
}

function buildFooter(
  sections: KasumiDocument['sections'],
  sectionIndex: number,
  variant: 'default' | 'first' | 'even' = 'default',
): Footer {
  const doc = resolveHeaderFooterDoc(sections, sectionIndex, 'footer', variant)
  const children = doc ? pmToDocxElements(doc) : []
  return new Footer({
    children: [
      ...children,
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ text: 'Page ' }),
          new TextRun({ children: [PageNumber.CURRENT] }),
          new TextRun({ text: ' of ' }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES] }),
        ],
      }),
    ],
  })
}

function mapSectionBreakType(
  value: 'next_page' | 'continuous' | 'odd_page' | 'even_page' | undefined,
): (typeof SectionType)[keyof typeof SectionType] | undefined {
  switch (value) {
    case 'continuous':
      return SectionType.CONTINUOUS
    case 'odd_page':
      return SectionType.ODD_PAGE
    case 'even_page':
      return SectionType.EVEN_PAGE
    case 'next_page':
    default:
      return value ? SectionType.NEXT_PAGE : undefined
  }
}

function buildDocxDocument(
  kasumiDoc: KasumiDocument,
  orchestrator: LayoutOrchestrator,
): Document {
  const docSections = []
  const usesEvenAndOddHeaderFooter = kasumiDoc.sections.some(section => section.pageStyle.differentOddEven)

  for (const [sectionIndex, section] of kasumiDoc.sections.entries()) {
    const instance = orchestrator.getSection(section.id)
    if (!instance) continue

    const ps = section.pageStyle
    const children = pmToDocxElements(instance.state.doc)
    const hasDifferentFirstPage = ps.differentFirstPage
    const hasDifferentOddEven = ps.differentOddEven
    const isFirstSection = sectionIndex === 0
    const hasLinkedHeader = !isFirstSection && (section.header?.linkToPrevious?.default ?? !section.header)
    const hasLinkedFooter = !isFirstSection && (section.footer?.linkToPrevious?.default ?? !section.footer)
    const hasLinkedFirstHeader = !isFirstSection && (section.header?.linkToPrevious?.first ?? !section.header)
    const hasLinkedEvenHeader = !isFirstSection && (section.header?.linkToPrevious?.even ?? !section.header)
    const hasLinkedFirstFooter = !isFirstSection && (section.footer?.linkToPrevious?.first ?? !section.footer)
    const hasLinkedEvenFooter = !isFirstSection && (section.footer?.linkToPrevious?.even ?? !section.footer)

    docSections.push({
      properties: {
        page: {
          size: pageSize(ps),
          margin: {
            top:    mmToTwip(ps.margins.top),
            bottom: mmToTwip(ps.margins.bottom),
            left:   mmToTwip(ps.margins.left),
            right:  mmToTwip(ps.margins.right),
            header: mmToTwip(ps.margins.header),
            footer: mmToTwip(ps.margins.footer),
          },
        },
        titlePage: hasDifferentFirstPage ? true : undefined,
        type: mapSectionBreakType(section.sectionBreak?.type),
      },
      headers: !hasLinkedHeader || isFirstSection || (!hasLinkedFirstHeader && hasDifferentFirstPage) || (!hasLinkedEvenHeader && hasDifferentOddEven)
        ? {
            default: !hasLinkedHeader || isFirstSection
              ? buildHeader(kasumiDoc.sections, sectionIndex, kasumiDoc.title, 'default', isFirstSection)
              : undefined,
            first: hasDifferentFirstPage && !hasLinkedFirstHeader
              ? buildHeader(kasumiDoc.sections, sectionIndex, kasumiDoc.title, 'first')
              : undefined,
            even: hasDifferentOddEven && !hasLinkedEvenHeader
              ? buildHeader(kasumiDoc.sections, sectionIndex, kasumiDoc.title, 'even')
              : undefined,
          }
        : undefined,
      footers: !hasLinkedFooter || isFirstSection || (!hasLinkedFirstFooter && hasDifferentFirstPage) || (!hasLinkedEvenFooter && hasDifferentOddEven)
        ? {
            default: !hasLinkedFooter || isFirstSection
              ? buildFooter(kasumiDoc.sections, sectionIndex, 'default')
              : undefined,
            first: hasDifferentFirstPage && !hasLinkedFirstFooter
              ? buildFooter(kasumiDoc.sections, sectionIndex, 'first')
              : undefined,
            even: hasDifferentOddEven && !hasLinkedEvenFooter
              ? buildFooter(kasumiDoc.sections, sectionIndex, 'even')
              : undefined,
          }
        : undefined,
      children,
    })
  }

  return new Document({
    title: kasumiDoc.title,
    creator: 'KASUMI WORDO',
    evenAndOddHeaderAndFooters: usesEvenAndOddHeaderFooter,
    sections: docSections,
  })
}

export async function buildDocxArrayBuffer(
  kasumiDoc: KasumiDocument,
  orchestrator: LayoutOrchestrator,
): Promise<ArrayBuffer> {
  const doc = buildDocxDocument(kasumiDoc, orchestrator)
  return Packer.toArrayBuffer(doc)
}

// ── Main export ───────────────────────────────────────────────
export async function exportToDocx(
  kasumiDoc: KasumiDocument,
  orchestrator: LayoutOrchestrator,
): Promise<void> {
  const arrayBuffer = await buildDocxArrayBuffer(kasumiDoc, orchestrator)

  const safeName = `${kasumiDoc.title.replace(/[^\w\u4e00-\u9fa5 _-]/g, '') || 'document'}.docx`

  // Use native save dialog in Electron, browser download otherwise
  const { saveFile } = await import('../../../platform/native/useNativeBridge')
  await saveFile({
    defaultName: safeName,
    filters: [{ name: 'Word Document', extensions: ['docx'] }],
    data: arrayBuffer,
  })
}
