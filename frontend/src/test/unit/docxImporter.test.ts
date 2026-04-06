import { describe, it, expect } from 'vitest'
import { wordoSchema } from '../../modules/wordo-shell/editor/schema'
import {
  buildImportSectionFromHtml,
  DOCX_STYLE_MAP,
  htmlToPmDoc,
} from '../../modules/wordo-shell/services/DocxImporter'

describe('DocxImporter — paragraph parsing', () => {
  it('converts <p> to paragraph node', () => {
    const doc = htmlToPmDoc('<p>Hello world</p>', wordoSchema)
    expect(doc.firstChild?.type.name).toBe('paragraph')
    expect(doc.textContent).toBe('Hello world')
  })

  it('empty <p> becomes empty paragraph', () => {
    const doc = htmlToPmDoc('<p></p>', wordoSchema)
    expect(doc.firstChild?.type.name).toBe('paragraph')
    expect(doc.firstChild?.content.size).toBe(0)
  })

  it('empty html still yields at least one paragraph', () => {
    const doc = htmlToPmDoc('', wordoSchema)
    expect(doc.childCount).toBeGreaterThanOrEqual(1)
  })
})

describe('DocxImporter — structural parsing', () => {
  it('converts headings, lists, and tables into expected nodes', () => {
    const doc = htmlToPmDoc(
      '<h2>Title</h2><ul><li>One</li><li>Two</li></ul><table><tr><th>A</th></tr><tr><td>B</td></tr></table>',
      wordoSchema,
    )

    expect(doc.child(0).type.name).toBe('heading')
    expect(doc.child(0).attrs.level).toBe(2)
    expect(doc.child(1).type.name).toBe('bullet_list')
    expect(doc.child(1).childCount).toBe(2)
    expect(doc.child(2).type.name).toBe('table')
    expect(doc.child(2).childCount).toBe(2)
  })

  it('preserves inline marks', () => {
    const doc = htmlToPmDoc('<p><strong><em>Both</em></strong> <a href="https://example.com">Link</a></p>', wordoSchema)
    const para = doc.firstChild!
    const marked = para.firstChild!
    const link = para.lastChild!

    expect(marked.marks.map(mark => mark.type.name).sort()).toEqual(['em', 'strong'])
    expect(link.marks.find(mark => mark.type.name === 'link')?.attrs.href).toBe('https://example.com')
  })

  it('preserves richer inline formatting including breaks, script marks, and span styles', () => {
    const doc = htmlToPmDoc(
      '<p>Alpha<br /><sup>2</sup><sub>n</sub><span style="color: rgb(255, 0, 0); font-size: 16px; background-color: #ffff00;">Red</span></p>',
      wordoSchema,
    )
    const para = doc.firstChild!

    expect(para.child(1).type.name).toBe('hard_break')
    expect(para.child(2).marks.map(mark => mark.type.name)).toContain('superscript')
    expect(para.child(3).marks.map(mark => mark.type.name)).toContain('subscript')
    expect(para.child(4).marks.find(mark => mark.type.name === 'font_color')?.attrs.color).toContain('255')
    expect(para.child(4).marks.find(mark => mark.type.name === 'font_size')?.attrs.size).toBe('16px')
    expect(para.child(4).marks.map(mark => mark.type.name)).toContain('highlight')
  })

  it('preserves paragraph layout styles including alignment, spacing, indent, and page breaks', () => {
    const doc = htmlToPmDoc(
      '<p style="text-align: center; margin-left: 36pt; margin-right: 18pt; text-indent: 12pt; margin-top: 6pt; margin-bottom: 24pt; line-height: 1.5; page-break-before: always;">Styled paragraph</p>',
      wordoSchema,
    )
    const para = doc.firstChild!

    expect(para.attrs.textAlign).toBe('center')
    expect(para.attrs.indentLeft).toBe('36pt')
    expect(para.attrs.indentRight).toBe('18pt')
    expect(para.attrs.textIndent).toBe('12pt')
    expect(para.attrs.spaceBefore).toBe('6pt')
    expect(para.attrs.spaceAfter).toBe('24pt')
    expect(para.attrs.lineSpacing).toBe('1.5')
    expect(para.attrs.pageBreakBefore).toBe(true)
  })

  it('converts top-level images into paragraph-wrapped inline images and keeps assets', () => {
    const section = buildImportSectionFromHtml(
      '<img src="https://example.com/image.png" alt="Chart" title="chart.png" />',
      wordoSchema,
      { sectionIndex: 0, sourceName: 'sample.docx' },
    )

    const paragraph = section.pmDoc.firstChild!
    const imageNode = paragraph.firstChild!

    expect(paragraph.type.name).toBe('paragraph')
    expect(paragraph.attrs.id).toMatch(/^img_/)
    expect(imageNode.type.name).toBe('image')
    expect(imageNode.attrs.src).toBe('https://example.com/image.png')
    expect(section.assets).toHaveLength(1)
    expect(section.assets[0].mimeType).toBe('image/png')
    expect(section.assets[0].legacyPath).toContain('sample.docx/sections/0')
    expect(section.supportLevel).toBe('preserved_read_only')
  })

  it('retains unsupported objects as placeholders with precise warnings', () => {
    const section = buildImportSectionFromHtml(
      '<object data="spreadsheet.bin"></object>',
      wordoSchema,
      { sectionIndex: 1, sourceName: 'sample.docx' },
    )

    expect(section.pmDoc.textContent).toContain('Unsupported object retained as reference')
    expect(section.supportLevel).toBe('unsupported_but_retained_reference')
    expect(section.diagnostics?.some(warning => warning.code === 'docx.unsupported_object_retained')).toBe(true)
  })

  it('preserves nested lists without flattening child items into the parent paragraph', () => {
    const doc = htmlToPmDoc(
      '<ul><li>Parent<ul><li>Child</li></ul></li><li>Sibling</li></ul>',
      wordoSchema,
    )

    const list = doc.firstChild!
    const firstItem = list.firstChild!
    const nestedList = firstItem.child(1)

    expect(list.type.name).toBe('bullet_list')
    expect(firstItem.firstChild?.textContent).toBe('Parent')
    expect(nestedList.type.name).toBe('bullet_list')
    expect(nestedList.firstChild?.firstChild?.textContent).toBe('Child')
    expect(firstItem.textContent).toBe('ParentChild')
  })
})

describe('DocxImporter — mammoth configuration', () => {
  it('uses Mammoth style maps with valid quoted style names', () => {
    expect(DOCX_STYLE_MAP).toEqual([
      "p[style-name='Heading 1'] => h1:fresh",
      "p[style-name='Heading 2'] => h2:fresh",
      "p[style-name='Heading 3'] => h3:fresh",
      "p[style-name='Heading 4'] => h4:fresh",
      "p[style-name='Heading 5'] => h5:fresh",
      "p[style-name='Heading 6'] => h6:fresh",
      "p[style-name='List Paragraph'] => p:fresh",
      "r[style-name='Strong'] => strong",
      "r[style-name='Emphasis'] => em",
    ])
  })
})
