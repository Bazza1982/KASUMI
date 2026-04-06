import { describe, expect, it } from 'vitest'
import {
  buildLegacyPath,
  createDefaultPageStyle,
  createDocumentWarning,
  createFingerprint,
  createProvenance,
  createSemanticId,
} from '../../modules/wordo-shell/types/document'

describe('document types helpers', () => {
  it('creates semantic ids with the requested prefix', () => {
    const id = createSemanticId('sec')
    expect(id.startsWith('sec_')).toBe(true)
  })

  it('creates stable fingerprints for the same input', () => {
    expect(createFingerprint('hello world')).toBe(createFingerprint('hello world'))
    expect(createFingerprint('hello world')).not.toBe(createFingerprint('hello world!'))
  })

  it('builds legacy paths without empty segments', () => {
    expect(buildLegacyPath('docx', 'sections', 0, null, 'runs')).toBe('docx/sections/0/runs')
  })

  it('creates provenance with source and timestamps', () => {
    const provenance = createProvenance('import', { importLegacyPath: 'docx/sections/0' })
    expect(provenance.source).toBe('import')
    expect(provenance.createdAt).toBeTruthy()
    expect(provenance.importLegacyPath).toBe('docx/sections/0')
  })

  it('creates warnings with generated ids', () => {
    const warning = createDocumentWarning('docx_import_warn', 'Image downgraded')
    expect(warning.id.startsWith('warn_')).toBe(true)
    expect(warning.code).toBe('docx_import_warn')
  })

  it('creates a default page style with fingerprint and provenance', () => {
    const style = createDefaultPageStyle()
    expect(style.id.startsWith('page_style_')).toBe(true)
    expect(style.fingerprint).toBeTruthy()
    expect(style.provenance?.source).toBe('system')
  })
})
