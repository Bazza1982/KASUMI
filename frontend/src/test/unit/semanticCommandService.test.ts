import { beforeEach, describe, expect, it } from 'vitest'
import { wordoSchema } from '../../modules/wordo-shell/editor/schema'
import { executeSemanticCommand, getWordoDocumentCommandSurface, normalizeWordoCommand } from '../../modules/wordo-shell/services/SemanticCommandService'
import { buildPlatformCommandFromMcpToolCall, executeWordoMcpToolCall, getWordoMcpToolDefinitions } from '../../modules/wordo-shell/services/WordoMcpAdapter'
import { useWordoStore } from '../../modules/wordo-shell/stores/useWordoStore'
import { createFingerprint, createProvenance } from '../../modules/wordo-shell/types/document'

function freshState() {
  const state = useWordoStore.getState()
  state.orchestrator.getSections().forEach(inst => state.orchestrator.removeSection(inst.sectionId))
  state.orchestrator.createSection('sec_test_1', wordoSchema.nodes.doc.create(null, [
    wordoSchema.nodes.paragraph.create({ id: 'para_1' }, wordoSchema.text('Original paragraph')),
  ]))

  useWordoStore.setState({
    document: {
      id: `doc_semantic_${Date.now()}`,
      title: 'Semantic Test Doc',
      styleRegistry: [],
      defaultPageStyle: {
        id: 'default',
        size: 'A4',
        orientation: 'portrait',
        margins: { top: 25, bottom: 25, left: 30, right: 25, header: 12, footer: 12 },
        differentFirstPage: false,
        differentOddEven: false,
      },
      sections: [{
        id: 'sec_test_1',
        pageStyle: {
          id: 'default',
          size: 'A4',
          orientation: 'portrait',
          margins: { top: 25, bottom: 25, left: 30, right: 25, header: 12, footer: 12 },
          differentFirstPage: false,
          differentOddEven: false,
        },
        blocks: [],
        footnotes: [],
        blockIds: [],
        fingerprint: createFingerprint('sec_test_1'),
        provenance: createProvenance('system'),
        warnings: [],
      }],
      fingerprint: createFingerprint('doc_semantic'),
      provenance: createProvenance('system'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any,
    focusedSectionId: null,
    commandAudit: [],
  })
}

function makeContext() {
  const state = useWordoStore.getState()
  return {
    orchestrator: state.orchestrator,
    getDocument: () => useWordoStore.getState().document,
    actions: {
      addSection: state.addSection,
      deleteSection: state.deleteSection,
      updateSectionPageStyle: state.updateSectionPageStyle,
      updateSectionWatermark: state.updateSectionWatermark,
      updateSectionHeaderFooter: state.updateSectionHeaderFooter,
      recordCommandAudit: state.recordCommandAudit,
    },
  }
}

describe('SemanticCommandService', () => {
  beforeEach(freshState)

  it('normalizes platform commands into Wordo commands', () => {
    const command = normalizeWordoCommand({
      shell: 'wordo',
      type: 'insert_section',
      payload: { afterSectionId: null },
      fromAI: true,
    })

    expect(command.type).toBe('insert_section')
    expect(command.fromAI).toBe(true)
    expect((command as any).afterSectionId).toBeNull()
  })

  it('routes layout commands through store actions', () => {
    const result = executeSemanticCommand({
      shell: 'wordo',
      type: 'set_page_style',
      payload: {
        sectionId: 'sec_test_1',
        pageStyle: {
          id: 'letter_style',
          size: 'Letter',
          orientation: 'landscape',
          margins: { top: 20, bottom: 20, left: 20, right: 20, header: 10, footer: 10 },
          differentFirstPage: false,
          differentOddEven: false,
        },
      },
    }, makeContext())

    expect(result.success).toBe(true)
    expect(useWordoStore.getState().document.sections[0].pageStyle.size).toBe('Letter')
    expect(useWordoStore.getState().document.sections[0].pageStyle.orientation).toBe('landscape')
  })

  it('inserts a section at the requested position through the semantic layer', () => {
    const result = executeSemanticCommand({
      shell: 'wordo',
      type: 'insert_section',
      payload: { afterSectionId: null },
    }, makeContext())

    expect(result.success).toBe(true)
    expect(useWordoStore.getState().document.sections[0].id).toBe(result.commandResult?.changedObjectIds[0])
  })

  it('routes editor commands into the orchestrator transaction path', () => {
    const result = executeSemanticCommand({
      shell: 'wordo',
      type: 'rewrite_block',
      payload: {
        sectionId: 'sec_test_1',
        blockId: 'para_1',
        newText: 'Updated paragraph',
      },
    }, makeContext())

    expect(result.success).toBe(true)
    expect(useWordoStore.getState().orchestrator.getSection('sec_test_1')?.state.doc.textContent).toContain('Updated paragraph')
  })

  it('exposes an AI/MCP-safe document command surface', () => {
    const surface = getWordoDocumentCommandSurface()

    expect(surface.some(spec => spec.type === 'update_block')).toBe(true)
    expect(surface.some(spec => spec.type === 'set_page_style')).toBe(true)
    expect(surface.find(spec => spec.type === 'update_block')?.payload).toContain('patch')
  })

  it('maps command surface into MCP tool definitions', () => {
    const tools = getWordoMcpToolDefinitions()
    const updateBlockTool = tools.find(tool => tool.name === 'wordo.update_block')

    expect(updateBlockTool).toBeDefined()
    expect(updateBlockTool?.annotations.commandType).toBe('update_block')
    expect(updateBlockTool?.inputSchema.required).toContain('sectionId')
    expect(updateBlockTool?.inputSchema.properties.patch.type).toBe('object')
  })

  it('builds AI platform commands from MCP tool calls', () => {
    const command = buildPlatformCommandFromMcpToolCall('wordo.rewrite_block', {
      sectionId: 'sec_test_1',
      blockId: 'para_1',
      newText: 'From MCP',
    })

    expect(command.shell).toBe('wordo')
    expect(command.type).toBe('rewrite_block')
    expect(command.fromAI).toBe(true)
    expect(command.payload.newText).toBe('From MCP')
  })

  it('applies update_block patches and records command audit entries', () => {
    const result = executeSemanticCommand({
      shell: 'wordo',
      type: 'update_block',
      fromAI: true,
      payload: {
        sectionId: 'sec_test_1',
        blockId: 'para_1',
        patch: {
          text: 'Patched paragraph',
          alignment: 'center',
          lineSpacing: 1.5,
          spaceAfter: 12,
          pageBreakBefore: true,
        },
      },
    }, makeContext())

    const instance = useWordoStore.getState().orchestrator.getSection('sec_test_1')
    const node = instance?.state.doc.firstChild

    expect(result.success).toBe(true)
    expect(node?.textContent).toContain('Patched paragraph')
    expect(node?.attrs.textAlign).toBe('center')
    expect(node?.attrs.lineSpacing).toBe('1.5')
    expect(node?.attrs.spaceAfter).toBe('12pt')
    expect(node?.attrs.pageBreakBefore).toBe(true)

    const [auditEntry] = useWordoStore.getState().commandAudit
    expect(auditEntry.commandType).toBe('update_block')
    expect(auditEntry.source).toBe('ai')
    expect(auditEntry.success).toBe(true)
    expect(auditEntry.changedObjectIds).toContain('para_1')
  })

  it('executes MCP tool calls through the semantic layer and records audit', () => {
    const result = executeWordoMcpToolCall('wordo.rewrite_block', {
      sectionId: 'sec_test_1',
      blockId: 'para_1',
      newText: 'MCP rewritten paragraph',
    }, makeContext())

    expect(result.success).toBe(true)
    expect(useWordoStore.getState().orchestrator.getSection('sec_test_1')?.state.doc.textContent).toContain('MCP rewritten paragraph')
    expect(useWordoStore.getState().commandAudit[0].commandType).toBe('rewrite_block')
    expect(useWordoStore.getState().commandAudit[0].source).toBe('ai')
  })
})
