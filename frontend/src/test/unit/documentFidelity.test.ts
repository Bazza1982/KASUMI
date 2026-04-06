import { describe, expect, it } from 'vitest'
import { createOrchestrator } from '../../modules/wordo-shell/editor/LayoutOrchestrator'
import { wordoSchema } from '../../modules/wordo-shell/editor/schema'
import { analyzeDocumentFidelity } from '../../modules/wordo-shell/services/DocumentFidelity'
import {
  compareFidelityToBaseline,
  summarizeFidelityRegression,
  type FidelityRegressionBaseline,
} from '../../modules/wordo-shell/services/FidelityRegression'
import { buildImportSectionFromHtml } from '../../modules/wordo-shell/services/DocxImporter'
import { buildPaginationSnapshot } from '../../modules/wordo-shell/services/PaginationSnapshotBuilder'
import {
  createDefaultPageStyle,
  createDocumentWarning,
  createFingerprint,
  createProvenance,
  type DocumentSection,
  type ImportSupportLevel,
  type KasumiDocument,
} from '../../modules/wordo-shell/types/document'
import baselineByFixture from '../fixtures/wordo/docxFidelityBaseline.json'
import { DOCX_FIDELITY_FIXTURES } from '../fixtures/wordo/docxFidelityFixtures'

function makeSection(sectionId: string, supportLevel: ImportSupportLevel = 'full'): DocumentSection {
  return {
    id: sectionId,
    pageStyle: createDefaultPageStyle({ id: `page_${sectionId}` }),
    blocks: [],
    footnotes: [],
    fingerprint: createFingerprint(sectionId),
    provenance: createProvenance('import'),
    supportLevel,
    warnings: [],
  }
}

function makeDocument(sections: DocumentSection[]): KasumiDocument {
  return {
    id: 'doc_fidelity',
    title: 'Fidelity test',
    metadata: { title: 'Fidelity test', importSource: 'docx' },
    styleRegistry: [],
    defaultPageStyle: createDefaultPageStyle({ id: 'page_default' }),
    sections,
    styles: [],
    numbering: [],
    assets: [],
    warnings: [],
    fingerprint: createFingerprint('doc_fidelity'),
    provenance: createProvenance('import'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe('analyzeDocumentFidelity', () => {
  it('scores a clean mapped document as high fidelity', () => {
    const orchestrator = createOrchestrator()
    const sectionId = 'sec_clean'
    const pmDoc = wordoSchema.nodes.doc.create(null, [
      wordoSchema.nodes.heading.create({ id: 'heading_1', level: 1 }, wordoSchema.text('Clean title')),
      wordoSchema.nodes.paragraph.create({ id: 'para_1' }, wordoSchema.text('Clean paragraph')),
    ])
    orchestrator.createSection(sectionId, pmDoc)

    const document = makeDocument([makeSection(sectionId)])
    const pagination = buildPaginationSnapshot(document, orchestrator)
    const fidelity = analyzeDocumentFidelity(document, orchestrator, pagination)

    expect(fidelity.grade).toBe('high')
    expect(fidelity.overallScore).toBeGreaterThan(0.9)
    expect(fidelity.renderedObjectCount).toBe(2)
    expect(fidelity.warningCount).toBe(0)
    expect(fidelity.sourceTextLength).toBeGreaterThan(0)
    expect(fidelity.sourceTableCount).toBe(0)
  })

  it('penalizes unsupported content and warning-heavy imports', () => {
    const orchestrator = createOrchestrator()
    const sectionId = 'sec_warn'
    const imported = buildImportSectionFromHtml(
      '<object data="chart.bin"></object><p>Retained warning text</p>',
      wordoSchema,
      { sectionIndex: 0, sourceName: 'warn.docx' },
    )
    orchestrator.createSection(sectionId, imported.pmDoc)

    const section = makeSection(sectionId, imported.supportLevel)
    section.warnings = imported.diagnostics ?? []
    const document = makeDocument([section])
    document.warnings = [
      createDocumentWarning('docx.extra_warning', 'Extra import warning'),
    ]
    const pagination = buildPaginationSnapshot(document, orchestrator)
    const fidelity = analyzeDocumentFidelity(document, orchestrator, pagination)

    expect(fidelity.grade).toBe('low')
    expect(fidelity.warningCount).toBeGreaterThan(0)
    expect(fidelity.breakdown.sectionSupport).toBeLessThan(0.5)
    expect(fidelity.breakdown.tableCoverage).toBe(1)
  })
})

describe('Docx fidelity fixtures', () => {
  const typedBaseline = baselineByFixture as Record<string, FidelityRegressionBaseline>
  const regressionSnapshots: Array<{ fixtureId: string; snapshot: ReturnType<typeof analyzeDocumentFidelity> }> = []

  DOCX_FIDELITY_FIXTURES.forEach((fixture, index) => {
    it(`keeps regression baseline for ${fixture.name}`, () => {
      const orchestrator = createOrchestrator()
      const imported = buildImportSectionFromHtml(fixture.html, wordoSchema, {
        sectionIndex: index,
        sourceName: `fixture_${index}.docx`,
      })
      const sectionId = `sec_fixture_${index}`
      orchestrator.createSection(sectionId, imported.pmDoc)

      const section = makeSection(sectionId, imported.supportLevel)
      section.warnings = imported.diagnostics ?? []
      const document = makeDocument([section])
      const pagination = buildPaginationSnapshot(document, orchestrator)
      const fidelity = analyzeDocumentFidelity(document, orchestrator, pagination)
      regressionSnapshots.push({ fixtureId: fixture.id, snapshot: fidelity })
      const comparison = compareFidelityToBaseline(fixture.id, fidelity, typedBaseline[fixture.id])

      expect(fidelity.grade).toBe(fixture.expectedGrade)
      expect(fidelity.overallScore).toBeGreaterThanOrEqual(fixture.minScore)
      expect(comparison.status).toBe('pass')
    })
  })

  it('summarizes the corpus trend against the approved baseline', () => {
    const trend = summarizeFidelityRegression(regressionSnapshots, typedBaseline)

    expect(trend.failCount).toBe(0)
    expect(trend.warnCount).toBe(0)
    expect(trend.passCount).toBe(DOCX_FIDELITY_FIXTURES.length)
    expect(trend.averageScore).toBeGreaterThan(0.8)
  })
})
