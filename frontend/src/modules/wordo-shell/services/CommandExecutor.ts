// ============================================================
// KASUMI WORDO — Command Executor
// Dispatches WordoCommand objects to real PM transactions.
// All user and AI mutations go through here — never direct PM.
// Register with platform command bus in WordoShellRoute.
// ============================================================

import { wordoSchema } from '../editor/schema'
import { createLogger } from '../editor/logger'
import type { LayoutOrchestrator } from '../editor/LayoutOrchestrator'
import type { WordoCommand } from '../types/commands'
import type { AnyBlock, ParagraphBlock, HeadingBlock } from '../types/document'

const log = createLogger('Cmd')

export interface ExecuteResult {
  success: boolean
  error?: string
}

// ── Block → PM node conversion ────────────────────────────────

function blockToNode(block: AnyBlock) {
  switch (block.type) {
    case 'paragraph': {
      const b = block as ParagraphBlock
      const content = b.content.length > 0
        ? b.content.map(span => {
            const marks = span.marks.flatMap(m => {
              const markType = wordoSchema.marks[m.type]
              return markType ? [markType.create(m.attrs)] : []
            })
            return wordoSchema.text(span.text, marks)
          })
        : [wordoSchema.text(' ')]
      return wordoSchema.nodes.paragraph.create({ id: block.id ?? null }, content)
    }
    case 'heading': {
      const b = block as HeadingBlock
      const content = b.content.length > 0
        ? b.content.map(span => wordoSchema.text(span.text))
        : [wordoSchema.text(' ')]
      return wordoSchema.nodes.heading.create({ level: b.level, id: block.id ?? null }, content)
    }
    default:
      return wordoSchema.nodes.paragraph.create(null, [wordoSchema.text(`[${block.type}]`)])
  }
}

// ── Find block position in a section ─────────────────────────

function findBlockPos(state: import('prosemirror-state').EditorState, blockId: string): number | null {
  let found: number | null = null
  state.doc.forEach((node, pos) => {
    if (node.attrs?.id === blockId) found = pos
  })
  return found
}

// ── Command handlers ──────────────────────────────────────────

function handleInsertBlock(cmd: Extract<WordoCommand, { type: 'insert_block' }>, orch: LayoutOrchestrator): ExecuteResult {
  const inst = orch.getSection(cmd.sectionId)
  if (!inst) return { success: false, error: `section not found: ${cmd.sectionId}` }

  const newNode = blockToNode(cmd.block)
  let insertPos: number

  if (cmd.afterBlockId === null) {
    insertPos = 0
  } else {
    const afterPos = findBlockPos(inst.state, cmd.afterBlockId)
    if (afterPos === null) return { success: false, error: `afterBlock not found: ${cmd.afterBlockId}` }
    insertPos = afterPos + inst.state.doc.nodeAt(afterPos)!.nodeSize
  }

  const tr = inst.state.tr.insert(insertPos, newNode)
  tr.setMeta('addToHistory', true)
  orch.applyTransaction(cmd.sectionId, tr)
  log.info('insert-block-ok', { sectionId: cmd.sectionId, blockType: cmd.block.type, blockId: cmd.block.id })
  return { success: true }
}

function handleDeleteBlock(cmd: Extract<WordoCommand, { type: 'delete_block' }>, orch: LayoutOrchestrator): ExecuteResult {
  const inst = orch.getSection(cmd.sectionId)
  if (!inst) return { success: false, error: `section not found: ${cmd.sectionId}` }

  const pos = findBlockPos(inst.state, cmd.blockId)
  if (pos === null) return { success: false, error: `block not found: ${cmd.blockId}` }

  const node = inst.state.doc.nodeAt(pos)!
  const tr = inst.state.tr.delete(pos, pos + node.nodeSize)
  tr.setMeta('addToHistory', true)
  orch.applyTransaction(cmd.sectionId, tr)
  log.info('delete-block-ok', { sectionId: cmd.sectionId, blockId: cmd.blockId })
  return { success: true }
}

function handleRewriteBlock(cmd: Extract<WordoCommand, { type: 'rewrite_block' }>, orch: LayoutOrchestrator): ExecuteResult {
  const inst = orch.getSection(cmd.sectionId)
  if (!inst) return { success: false, error: `section not found: ${cmd.sectionId}` }

  const pos = findBlockPos(inst.state, cmd.blockId)
  if (pos === null) return { success: false, error: `block not found: ${cmd.blockId}` }

  const node = inst.state.doc.nodeAt(pos)!
  const newContent = wordoSchema.text(cmd.newText)
  const newNode = node.type.create(node.attrs, newContent)
  const tr = inst.state.tr.replaceWith(pos, pos + node.nodeSize, newNode)
  tr.setMeta('addToHistory', true)
  orch.applyTransaction(cmd.sectionId, tr)
  log.info('rewrite-block-ok', { sectionId: cmd.sectionId, blockId: cmd.blockId, textLength: cmd.newText.length })
  return { success: true }
}

function handleApplyStyle(cmd: Extract<WordoCommand, { type: 'apply_style' }>, orch: LayoutOrchestrator): ExecuteResult {
  // Style application is a future feature — log and acknowledge
  log.warn('apply-style-not-implemented', { styleId: cmd.styleId })
  return { success: false, error: 'apply_style not yet implemented' }
}

// ── Main dispatcher ───────────────────────────────────────────

export function executeCommand(
  command: WordoCommand,
  orchestrator: LayoutOrchestrator,
): ExecuteResult {
  const label = command.fromAI ? '[AI]' : '[user]'
  log.info('execute', { type: command.type, source: label, desc: (command as any).description })

  let result: ExecuteResult

  try {
    switch (command.type) {
      case 'insert_block':
        result = handleInsertBlock(command, orchestrator)
        break
      case 'delete_block':
        result = handleDeleteBlock(command, orchestrator)
        break
      case 'rewrite_block':
        result = handleRewriteBlock(command, orchestrator)
        break
      case 'apply_style':
        result = handleApplyStyle(command, orchestrator)
        break
      // Layout commands — delegate to store actions directly
      case 'set_watermark':
      case 'set_page_style':
      case 'set_header':
      case 'set_footer':
        log.warn('layout-command-needs-store', { type: command.type, hint: 'call store action directly' })
        result = { success: false, error: `${command.type}: dispatch to store instead` }
        break
      case 'insert_section':
      case 'delete_section':
        log.warn('section-command-needs-store', { type: command.type })
        result = { success: false, error: `${command.type}: dispatch to store instead` }
        break
      case 'update_block':
        log.warn('update-block-not-implemented', {})
        result = { success: false, error: 'update_block not yet implemented' }
        break
      default:
        log.warn('unknown-command', { type: (command as any).type })
        result = { success: false, error: `unknown command type: ${(command as any).type}` }
    }
  } catch (e) {
    const error = (e as Error).message
    log.error('execute-threw', { type: command.type, error })
    result = { success: false, error }
  }

  if (result.success) {
    log.info('execute-ok', { type: command.type })
  } else {
    log.error('execute-failed', { type: command.type, error: result.error })
  }

  return result
}
