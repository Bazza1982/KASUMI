import type { PlatformCommand } from '../../../platform/command-bus'
import type { LayoutOrchestrator } from '../editor/LayoutOrchestrator'
import { createOperationId, type HeaderFooter, type KasumiDocument, type PageStyle, type WatermarkConfig } from '../types/document'
import type { WordoCommand, WordoCommandAuditEntry, WordoCommandResult, WordoDocumentCommandSpec } from '../types/commands'
import { executeCommand, type ExecuteResult } from './CommandExecutor'

export interface SemanticCommandContext {
  orchestrator: LayoutOrchestrator
  getDocument: () => KasumiDocument
  actions: {
    addSection: (afterSectionId?: string | null) => string
    deleteSection: (sectionId: string) => void
    updateSectionPageStyle: (sectionId: string, pageStyle: PageStyle) => void
    updateSectionWatermark: (sectionId: string, watermark: WatermarkConfig) => void
    updateSectionHeaderFooter: (sectionId: string, zone: 'header' | 'footer', value: HeaderFooter | undefined) => void
    recordCommandAudit?: (entry: WordoCommandAuditEntry) => void
  }
}

export const WORDO_DOCUMENT_COMMAND_SPECS: WordoDocumentCommandSpec[] = [
  { type: 'insert_block', description: 'Insert a new block into a target section.', payload: ['sectionId', 'afterBlockId', 'block'], layoutImpact: 'local' },
  { type: 'delete_block', description: 'Delete an existing block from a section.', payload: ['sectionId', 'blockId'], layoutImpact: 'local' },
  { type: 'update_block', description: 'Patch block text or paragraph-level layout attrs without replacing the whole section.', payload: ['sectionId', 'blockId', 'patch'], layoutImpact: 'local' },
  { type: 'rewrite_block', description: 'Replace a block text body with plain text.', payload: ['sectionId', 'blockId', 'newText'], layoutImpact: 'local' },
  { type: 'set_page_style', description: 'Update page size, margins, orientation, or first/odd-even flags for one section.', payload: ['sectionId', 'pageStyle'], layoutImpact: 'whole_section' },
  { type: 'set_header', description: 'Set header content for a section.', payload: ['sectionId', 'header'], layoutImpact: 'whole_section' },
  { type: 'set_footer', description: 'Set footer content for a section.', payload: ['sectionId', 'footer'], layoutImpact: 'whole_section' },
  { type: 'set_watermark', description: 'Set watermark config for a section.', payload: ['sectionId', 'watermark'], layoutImpact: 'whole_section' },
  { type: 'insert_section', description: 'Insert a new section before or after an existing section.', payload: ['afterSectionId'], layoutImpact: 'whole_section' },
  { type: 'delete_section', description: 'Delete one section.', payload: ['sectionId'], layoutImpact: 'whole_section' },
]

export function getWordoDocumentCommandSurface(): WordoDocumentCommandSpec[] {
  return WORDO_DOCUMENT_COMMAND_SPECS
}

function makeCommandResult(
  command: WordoCommand,
  changedObjectIds: string[],
  layoutImpact: WordoCommandResult['layoutImpact'],
): WordoCommandResult {
  return {
    operationId: command.operationId ?? createOperationId(),
    changedObjectIds,
    layoutImpact,
    warnings: [],
    idMapping: [],
  }
}

function isPlatformCommand(command: WordoCommand | PlatformCommand): command is PlatformCommand {
  return 'shell' in command && 'payload' in command
}

export function normalizeWordoCommand(command: WordoCommand | PlatformCommand): WordoCommand {
  if (!isPlatformCommand(command)) return command

  return {
    type: command.type as WordoCommand['type'],
    fromAI: command.fromAI,
    ...(command.payload as Record<string, unknown>),
  } as WordoCommand
}

export function executeSemanticCommand(
  input: WordoCommand | PlatformCommand,
  context: SemanticCommandContext,
): ExecuteResult {
  const command = normalizeWordoCommand(input)
  let result: ExecuteResult

  switch (command.type) {
    case 'set_page_style':
      context.actions.updateSectionPageStyle(command.sectionId, command.pageStyle as PageStyle)
      result = { success: true, commandResult: makeCommandResult(command, [command.sectionId], 'whole_section') }
      break
    case 'set_watermark':
      context.actions.updateSectionWatermark(command.sectionId, command.watermark as WatermarkConfig)
      result = { success: true, commandResult: makeCommandResult(command, [command.sectionId], 'whole_section') }
      break
    case 'set_header':
      context.actions.updateSectionHeaderFooter(command.sectionId, 'header', command.header as HeaderFooter)
      result = { success: true, commandResult: makeCommandResult(command, [command.sectionId, command.header.id], 'whole_section') }
      break
    case 'set_footer':
      context.actions.updateSectionHeaderFooter(command.sectionId, 'footer', command.footer as HeaderFooter)
      result = { success: true, commandResult: makeCommandResult(command, [command.sectionId, command.footer.id], 'whole_section') }
      break
    case 'insert_section': {
      const sectionId = context.actions.addSection(command.afterSectionId)
      result = { success: true, commandResult: makeCommandResult(command, [sectionId], 'whole_section') }
      break
    }
    case 'delete_section':
      context.actions.deleteSection(command.sectionId)
      result = { success: true, commandResult: makeCommandResult(command, [command.sectionId], 'whole_section') }
      break
    default:
      result = executeCommand(command, context.orchestrator)
      break
  }

  context.actions.recordCommandAudit?.({
    operationId: result.commandResult?.operationId ?? command.operationId ?? createOperationId(),
    commandType: command.type,
    sectionId: 'sectionId' in command ? command.sectionId : undefined,
    blockId: 'blockId' in command ? command.blockId : undefined,
    source: command.fromAI ? 'ai' : 'user',
    timestamp: new Date().toISOString(),
    success: result.success,
    description: command.description,
    changedObjectIds: result.commandResult?.changedObjectIds ?? [],
    layoutImpact: result.commandResult?.layoutImpact,
    warnings: result.commandResult?.warnings ?? [],
    idMapping: result.commandResult?.idMapping ?? [],
    error: result.error,
  })

  return result
}
