// ============================================================
// KASUMI WORDO — .docx Exporter
// Converts ProseMirror document state → .docx via `docx` library.
// ============================================================

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, PageOrientation,
  Header, Footer, PageNumber,
} from 'docx'
import type { Node as PmNode } from 'prosemirror-model'
import type { KasumiDocument, PageStyle } from '../types/document'
import type { LayoutOrchestrator } from '../editor/LayoutOrchestrator'

// ── Helpers ──────────────────────────────────────────────────
const mmToTwip = (mm: number) => Math.round(mm * 56.6929)

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

function pmTextRuns(node: PmNode): TextRun[] {
  const runs: TextRun[] = []
  node.forEach(child => {
    if (child.isText) {
      const marks = child.marks.map(m => m.type.name)
      runs.push(new TextRun({
        text: child.text ?? '',
        bold: marks.includes('strong'),
        italics: marks.includes('em'),
        underline: marks.includes('underline') ? {} : undefined,
        strike: marks.includes('strikethrough'),
      }))
    }
  })
  return runs.length ? runs : [new TextRun({ text: '' })]
}

function pmToDocxElements(node: PmNode): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = []

  node.forEach(child => {
    switch (child.type.name) {

      case 'paragraph':
        out.push(new Paragraph({ children: pmTextRuns(child), spacing: { after: 120 } }))
        break

      case 'heading':
        out.push(new Paragraph({
          heading: toHeadingLevel(child.attrs['level'] as number),
          children: pmTextRuns(child),
        }))
        break

      case 'bullet_list':
        child.forEach(item => {
          item.forEach(para => {
            out.push(new Paragraph({
              bullet: { level: 0 },
              children: pmTextRuns(para),
            }))
          })
        })
        break

      case 'ordered_list':
        child.forEach(item => {
          item.forEach(para => {
            out.push(new Paragraph({
              numbering: { reference: 'default-numbering', level: 0 },
              children: pmTextRuns(para),
            }))
          })
        })
        break

      case 'blockquote':
        child.forEach(para => {
          out.push(new Paragraph({
            indent: { left: mmToTwip(12) },
            children: pmTextRuns(para),
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
            cell.forEach(p => cellParas.push(new Paragraph({ children: pmTextRuns(p), spacing: { after: 60 } })))
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

// ── Main export ───────────────────────────────────────────────
export async function exportToDocx(
  kasumiDoc: KasumiDocument,
  orchestrator: LayoutOrchestrator,
): Promise<void> {
  const docSections = []

  for (const section of kasumiDoc.sections) {
    const instance = orchestrator.getSection(section.id)
    if (!instance) continue

    const ps = section.pageStyle
    const children = pmToDocxElements(instance.state.doc)

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
      },
      headers: {
        default: new Header({
          children: [new Paragraph({ children: [new TextRun({ text: kasumiDoc.title, color: '999999' })] })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: 'Page ' }),
              new TextRun({ children: [PageNumber.CURRENT] }),
              new TextRun({ text: ' of ' }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES] }),
            ],
          })],
        }),
      },
      children,
    })
  }

  const doc = new Document({
    title: kasumiDoc.title,
    creator: 'KASUMI WORDO',
    sections: docSections,
  })

  const blob = await Packer.toBlob(doc)
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), {
    href: url,
    download: `${kasumiDoc.title.replace(/[^\w\u4e00-\u9fa5 _-]/g, '')}.docx`,
  })
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
