import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { createOrchestrator } from '../../modules/wordo-shell/editor/LayoutOrchestrator'
import { wordoSchema } from '../../modules/wordo-shell/editor/schema'
import { buildDocxArrayBuffer } from '../../modules/wordo-shell/services/DocxExporter'
import {
  createDefaultPageStyle,
  createFingerprint,
  createProvenance,
  type HeaderFooter,
  type KasumiDocument,
} from '../../modules/wordo-shell/types/document'

function makeHeaderFooter(text: string): HeaderFooter {
  const defaultJson = wordoSchema.nodes.doc.create(null, [
    wordoSchema.nodes.paragraph.create(null, wordoSchema.text(text)),
  ]).toJSON()
  const firstJson = wordoSchema.nodes.doc.create(null, [
    wordoSchema.nodes.paragraph.create(null, wordoSchema.text(`${text} First`)),
  ]).toJSON()
  const evenJson = wordoSchema.nodes.doc.create(null, [
    wordoSchema.nodes.paragraph.create(null, wordoSchema.text(`${text} Even`)),
  ]).toJSON()

  return {
    id: createFingerprint(`hf-id:${text}`),
    default: [],
    pmDocJson: defaultJson,
    previewText: text,
    variantDocs: {
      default: defaultJson,
      first: firstJson,
      even: evenJson,
    },
    variantPreviewText: {
      default: text,
      first: `${text} First`,
      even: `${text} Even`,
    },
    fingerprint: createFingerprint(`hf:${text}`),
    provenance: createProvenance('user'),
  }
}

function makeDocument(sectionId: string): KasumiDocument {
  const now = new Date().toISOString()
  return {
    id: 'doc_export_test',
    title: 'Export Regression',
    metadata: { title: 'Export Regression', importSource: 'docx' },
    styleRegistry: [],
    defaultPageStyle: createDefaultPageStyle({ id: 'page_default' }),
    sections: [
      {
        id: sectionId,
        pageStyle: createDefaultPageStyle({ id: 'page_export' }),
        header: makeHeaderFooter('Confidential Review Header'),
        footer: makeHeaderFooter('Prepared by Renee'),
        blocks: [],
        footnotes: [],
        blockIds: [],
        fingerprint: createFingerprint(sectionId),
        provenance: createProvenance('import'),
        warnings: [],
      },
    ],
    styles: [],
    numbering: [],
    assets: [],
    warnings: [],
    fingerprint: createFingerprint('doc_export_test'),
    provenance: createProvenance('import'),
    createdAt: now,
    updatedAt: now,
  }
}

function makeVariantDocument(sectionId: string): KasumiDocument {
  const doc = makeDocument(sectionId)
  doc.sections[0] = {
    ...doc.sections[0],
    pageStyle: createDefaultPageStyle({
      id: 'page_variant',
      differentFirstPage: true,
      differentOddEven: true,
    }),
  }
  return doc
}

function makeMultiSectionDocument(sectionIds: [string, string]): KasumiDocument {
  const now = new Date().toISOString()
  const [firstId, secondId] = sectionIds

  return {
    id: 'doc_export_multisection',
    title: 'Multi Section Export Regression',
    metadata: { title: 'Multi Section Export Regression', importSource: 'docx' },
    styleRegistry: [],
    defaultPageStyle: createDefaultPageStyle({ id: 'page_default_multi' }),
    sections: [
      {
        id: firstId,
        pageStyle: createDefaultPageStyle({ id: 'page_multi_1' }),
        header: makeHeaderFooter('Inherited Header'),
        footer: makeHeaderFooter('Inherited Footer'),
        blocks: [],
        footnotes: [],
        blockIds: [],
        fingerprint: createFingerprint(firstId),
        provenance: createProvenance('import'),
        warnings: [],
      },
      {
        id: secondId,
        pageStyle: createDefaultPageStyle({ id: 'page_multi_2' }),
        blocks: [],
        footnotes: [],
        blockIds: [],
        fingerprint: createFingerprint(secondId),
        provenance: createProvenance('import'),
        warnings: [],
        sectionBreak: { type: 'continuous' },
      },
    ],
    styles: [],
    numbering: [],
    assets: [],
    warnings: [],
    fingerprint: createFingerprint('doc_export_multisection'),
    provenance: createProvenance('import'),
    createdAt: now,
    updatedAt: now,
  }
}

describe('DocxExporter', () => {
  it('keeps edited text content in DOCX round-trip smoke export', async () => {
    const orchestrator = createOrchestrator()
    const sectionId = 'sec_export'
    const pmDoc = wordoSchema.nodes.doc.create(null, [
      wordoSchema.nodes.heading.create({ id: 'heading_export', level: 1 }, wordoSchema.text('Weekly Memo')),
      wordoSchema.nodes.paragraph.create({ id: 'para_intro' }, wordoSchema.text('Initial intro line.')),
      wordoSchema.nodes.bullet_list.create({ id: 'list_export' }, [
        wordoSchema.nodes.list_item.create({ id: 'li_1' }, [
          wordoSchema.nodes.paragraph.create({ id: 'li_1_para' }, wordoSchema.text('Collect evidence')),
        ]),
        wordoSchema.nodes.list_item.create({ id: 'li_2' }, [
          wordoSchema.nodes.paragraph.create({ id: 'li_2_para' }, wordoSchema.text('Review controls')),
        ]),
      ]),
      wordoSchema.nodes.table.create({ id: 'table_export' }, [
        wordoSchema.nodes.table_row.create(null, [
          wordoSchema.nodes.table_header.create(null, [
            wordoSchema.nodes.paragraph.create(null, wordoSchema.text('Area')),
          ]),
          wordoSchema.nodes.table_header.create(null, [
            wordoSchema.nodes.paragraph.create(null, wordoSchema.text('Status')),
          ]),
        ]),
        wordoSchema.nodes.table_row.create(null, [
          wordoSchema.nodes.table_cell.create(null, [
            wordoSchema.nodes.paragraph.create(null, wordoSchema.text('Cash')),
          ]),
          wordoSchema.nodes.table_cell.create(null, [
            wordoSchema.nodes.paragraph.create(null, wordoSchema.text('Done')),
          ]),
        ]),
      ]),
    ])
    orchestrator.createSection(sectionId, pmDoc)

    const instance = orchestrator.getSection(sectionId)!
    const editTransaction = instance.state.tr.insert(
      instance.state.doc.content.size,
      wordoSchema.nodes.paragraph.create({ id: 'para_edited' }, wordoSchema.text('Edited conclusion after reflow.')),
    )
    orchestrator.applyTransaction(sectionId, editTransaction)

    const arrayBuffer = await buildDocxArrayBuffer(makeDocument(sectionId), orchestrator)
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) })
    const normalizedText = result.value.replace(/\s+/g, ' ').trim()

    expect(normalizedText).toContain('Weekly Memo')
    expect(normalizedText).toContain('Collect evidence')
    expect(normalizedText).toContain('Review controls')
    expect(normalizedText).toContain('Cash')
    expect(normalizedText).toContain('Done')
    expect(normalizedText).toContain('Edited conclusion after reflow.')
  })

  it('serializes rich inline formatting and nested list levels into DOCX XML', async () => {
    const orchestrator = createOrchestrator()
    const sectionId = 'sec_export_inline_rich'
    const richParagraph = wordoSchema.nodes.paragraph.create({ id: 'para_inline_rich' }, [
      wordoSchema.text('Alpha'),
      wordoSchema.nodes.hard_break.create(),
      wordoSchema.text('2', [wordoSchema.mark('superscript')]),
      wordoSchema.text('n', [wordoSchema.mark('subscript')]),
      wordoSchema.text('Red', [
        wordoSchema.mark('font_color', { color: '#ff0000' }),
        wordoSchema.mark('font_size', { size: '16px' }),
      ]),
      wordoSchema.text('Link', [wordoSchema.mark('link', { href: 'https://example.com/audit' })]),
    ])
    const nestedList = wordoSchema.nodes.bullet_list.create({ id: 'list_nested_export' }, [
      wordoSchema.nodes.list_item.create({ id: 'li_parent' }, [
        wordoSchema.nodes.paragraph.create({ id: 'li_parent_para' }, wordoSchema.text('Parent')),
        wordoSchema.nodes.bullet_list.create({ id: 'list_nested_child' }, [
          wordoSchema.nodes.list_item.create({ id: 'li_child' }, [
            wordoSchema.nodes.paragraph.create({ id: 'li_child_para' }, wordoSchema.text('Child')),
          ]),
        ]),
      ]),
    ])

    orchestrator.createSection(sectionId, wordoSchema.nodes.doc.create(null, [richParagraph, nestedList]))

    const arrayBuffer = await buildDocxArrayBuffer(makeDocument(sectionId), orchestrator)
    const zip = await JSZip.loadAsync(Buffer.from(arrayBuffer))
    const documentXml = await zip.file('word/document.xml')?.async('string')
    const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string')

    expect(documentXml).toContain('w:br')
    expect(documentXml).toContain('w:vertAlign w:val="superscript"')
    expect(documentXml).toContain('w:vertAlign w:val="subscript"')
    expect(documentXml).toContain('w:color w:val="FF0000"')
    expect(documentXml).toContain('w:sz w:val="24"')
    expect(documentXml).toContain('w:hyperlink')
    expect(documentXml).toContain('w:ilvl w:val="1"')
    expect(relsXml).toContain('https://example.com/audit')
  })

  it('serializes paragraph alignment, spacing, indent, and page breaks into DOCX XML', async () => {
    const orchestrator = createOrchestrator()
    const sectionId = 'sec_export_layout_rich'
    const styledParagraph = wordoSchema.nodes.paragraph.create({
      id: 'para_layout_rich',
      textAlign: 'center',
      lineSpacing: '1.5',
      spaceBefore: '12pt',
      spaceAfter: '18pt',
      indentLeft: '36pt',
      indentRight: '18pt',
      textIndent: '12pt',
      pageBreakBefore: true,
    }, wordoSchema.text('Styled layout paragraph'))

    orchestrator.createSection(sectionId, wordoSchema.nodes.doc.create(null, [styledParagraph]))

    const arrayBuffer = await buildDocxArrayBuffer(makeDocument(sectionId), orchestrator)
    const zip = await JSZip.loadAsync(Buffer.from(arrayBuffer))
    const documentXml = await zip.file('word/document.xml')?.async('string')

    expect(documentXml).toContain('w:jc w:val="center"')
    expect(documentXml).toContain('w:before="240"')
    expect(documentXml).toContain('w:after="360"')
    expect(documentXml).toContain('w:line="360"')
    expect(documentXml).toContain('w:left="720"')
    expect(documentXml).toContain('w:right="360"')
    expect(documentXml).toContain('w:firstLine="240"')
    expect(documentXml).toContain('w:pageBreakBefore')
  })

  it('serializes custom header/footer content into DOCX section parts', async () => {
    const orchestrator = createOrchestrator()
    const sectionId = 'sec_export_hf'
    orchestrator.createSection(sectionId, wordoSchema.nodes.doc.create(null, [
      wordoSchema.nodes.paragraph.create({ id: 'body_para' }, wordoSchema.text('Body text')),
    ]))

    const arrayBuffer = await buildDocxArrayBuffer(makeDocument(sectionId), orchestrator)
    const zip = await JSZip.loadAsync(Buffer.from(arrayBuffer))
    const headerXml = await zip.file('word/header1.xml')?.async('string')
    const footerXml = await zip.file('word/footer1.xml')?.async('string')

    expect(headerXml).toContain('Confidential Review Header')
    expect(footerXml).toContain('Prepared by Renee')
    expect(footerXml).toContain('PAGE')
  })

  it('emits first-page and even-page header/footer references when page style requests them', async () => {
    const orchestrator = createOrchestrator()
    const sectionId = 'sec_export_variants'
    orchestrator.createSection(sectionId, wordoSchema.nodes.doc.create(null, [
      wordoSchema.nodes.paragraph.create({ id: 'body_para_variants' }, wordoSchema.text('Variant body text')),
    ]))

    const arrayBuffer = await buildDocxArrayBuffer(makeVariantDocument(sectionId), orchestrator)
    const zip = await JSZip.loadAsync(Buffer.from(arrayBuffer))
    const documentXml = await zip.file('word/document.xml')?.async('string')
    const settingsXml = await zip.file('word/settings.xml')?.async('string')
    const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string')
    const header2Xml = await zip.file('word/header2.xml')?.async('string')
    const header3Xml = await zip.file('word/header3.xml')?.async('string')

    expect(documentXml).toContain('w:titlePg')
    expect(documentXml).toContain('w:headerReference w:type="default"')
    expect(documentXml).toContain('w:headerReference w:type="first"')
    expect(documentXml).toContain('w:headerReference w:type="even"')
    expect(documentXml).toContain('w:footerReference w:type="default"')
    expect(documentXml).toContain('w:footerReference w:type="first"')
    expect(documentXml).toContain('w:footerReference w:type="even"')
    expect(settingsXml).toContain('w:evenAndOddHeaders')
    expect(header2Xml).toContain('Confidential Review Header First')
    expect(header3Xml).toContain('Confidential Review Header Even')

    expect(relsXml?.match(/header\d+\.xml/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
    expect(relsXml?.match(/footer\d+\.xml/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })

  it('inherits header/footer references across sections and emits section break type', async () => {
    const orchestrator = createOrchestrator()
    const firstSectionId = 'sec_export_multi_1'
    const secondSectionId = 'sec_export_multi_2'
    orchestrator.createSection(firstSectionId, wordoSchema.nodes.doc.create(null, [
      wordoSchema.nodes.paragraph.create({ id: 'body_para_multi_1' }, wordoSchema.text('First section body text')),
    ]))
    orchestrator.createSection(secondSectionId, wordoSchema.nodes.doc.create(null, [
      wordoSchema.nodes.paragraph.create({ id: 'body_para_multi_2' }, wordoSchema.text('Second section body text')),
    ]))

    const arrayBuffer = await buildDocxArrayBuffer(makeMultiSectionDocument([firstSectionId, secondSectionId]), orchestrator)
    const zip = await JSZip.loadAsync(Buffer.from(arrayBuffer))
    const documentXml = await zip.file('word/document.xml')?.async('string')
    const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string')

    expect(documentXml).toContain('w:headerReference w:type="default"')
    expect(documentXml).toContain('w:footerReference w:type="default"')
    expect(documentXml).toContain('w:type w:val="continuous"')

    expect(documentXml?.match(/w:headerReference w:type="default"/g)?.length).toBe(1)
    expect(documentXml?.match(/w:footerReference w:type="default"/g)?.length).toBe(1)
    expect(relsXml?.match(/header\d+\.xml/g)?.length).toBe(1)
    expect(relsXml?.match(/footer\d+\.xml/g)?.length).toBe(1)
  })

  it('breaks header/footer inheritance when a later section explicitly unlinks variants', async () => {
    const orchestrator = createOrchestrator()
    const firstSectionId = 'sec_export_unlink_1'
    const secondSectionId = 'sec_export_unlink_2'
    orchestrator.createSection(firstSectionId, wordoSchema.nodes.doc.create(null, [
      wordoSchema.nodes.paragraph.create({ id: 'body_para_unlink_1' }, wordoSchema.text('First body')),
    ]))
    orchestrator.createSection(secondSectionId, wordoSchema.nodes.doc.create(null, [
      wordoSchema.nodes.paragraph.create({ id: 'body_para_unlink_2' }, wordoSchema.text('Second body')),
    ]))

    const doc = makeMultiSectionDocument([firstSectionId, secondSectionId])
    doc.sections[1] = {
      ...doc.sections[1],
      pageStyle: createDefaultPageStyle({
        id: 'page_unlink_2',
        differentFirstPage: true,
        differentOddEven: true,
      }),
      header: {
        ...makeHeaderFooter('Local Header'),
        linkToPrevious: { default: false, first: false, even: false },
      },
      footer: {
        ...makeHeaderFooter('Local Footer'),
        linkToPrevious: { default: false, first: false, even: false },
      },
    }

    const arrayBuffer = await buildDocxArrayBuffer(doc, orchestrator)
    const zip = await JSZip.loadAsync(Buffer.from(arrayBuffer))
    const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string')
    const header2Xml = await zip.file('word/header2.xml')?.async('string')
    const header3Xml = await zip.file('word/header3.xml')?.async('string')
    const header4Xml = await zip.file('word/header4.xml')?.async('string')

    expect(relsXml?.match(/header\d+\.xml/g)?.length).toBe(4)
    expect(header2Xml).toContain('Local Header')
    expect(header3Xml).toContain('Local Header First')
    expect(header4Xml).toContain('Local Header Even')
  })
})
