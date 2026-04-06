// ============================================================
// KASUMI WORDO — Command Executor
// Dispatches WordoCommand objects to real PM transactions.
// All user and AI mutations go through here — never direct PM.
// Register with platform command bus in WordoShellRoute.
// ============================================================

import { wordoSchema } from '../editor/schema'
import { createLogger } from '../editor/logger'
import type { LayoutOrchestrator } from '../editor/LayoutOrchestrator'
import type { WordoCommand, WordoCommandResult } from '../types/commands'
import { createDocumentWarning, createOperationId, type AnyBlock, type ParagraphBlock, type HeadingBlock, type Run } from '../types/document'

const log = createLogger('Cmd')

export interface ExecuteResult {
  success: boolean
  error?: string
  commandResult?: WordoCommandResult
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

function runsToPmContent(runs: Run[]) {
  if (runs.length === 0) return [wordoSchema.text(' ')]

  return runs.map(run => {
    const marks = run.marks.flatMap(mark => {
      switch (mark.type) {
        case 'link':
          return mark.attrs?.href ? [wordoSchema.marks.link.create({ href: mark.attrs.href })] : []
        case 'superscript':
          return [wordoSchema.marks.superscript.create()]
        case 'subscript':
          return [wordoSchema.marks.subscript.create()]
        case 'underline':
          return [wordoSchema.marks.underline.create()]
        case 'strikethrough':
          return [wordoSchema.marks.strikethrough.create()]
        case 'bold':
        case 'italic':
        case 'code': {
          const markType = wordoSchema.marks[mark.type]
          return markType ? [markType.create()] : []
        }
        default:
          return []
      }
    })

    if (run.charFormat?.color) {
      marks.push(wordoSchema.marks.font_color.create({ color: String(run.charFormat.color) }))
    }
    if (run.charFormat?.fontSize) {
      marks.push(wordoSchema.marks.font_size.create({ size: String(run.charFormat.fontSize) }))
    }
    return wordoSchema.text(run.text, marks)
  })
}

function textToPmContent(text: string) {
  return [wordoSchema.text(text.length > 0 ? text : ' ')]
}

// ── Find block position in a section ─────────────────────────

function findBlockPos(state: import('prosemirror-state').EditorState, blockId: string): number | null {
  let found: number | null = null
  state.doc.forEach((node, pos) => {
    if (node.attrs?.id === blockId) found = pos
  })
  return found
}

function makeCommandResult(
  command: WordoCommand,
  changedObjectIds: string[],
  overrides: Partial<WordoCommandResult> = {},
): WordoCommandResult {
  return {
    operationId: command.operationId ?? createOperationId(),
    changedObjectIds,
    layoutImpact: 'local',
    warnings: [],
    idMapping: [],
    ...overrides,
  }
}

function toParagraphCssValue(value: string | number | undefined, unit = 'pt'): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value === 'number') return `${value}${unit}`
  return value
}

function toIndentLeft(indentLevel: number | undefined): string | null | undefined {
  if (indentLevel === undefined) return undefined
  return `${indentLevel * 18}pt`
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
  return { success: true, commandResult: makeCommandResult(cmd, [cmd.block.id, cmd.sectionId]) }
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
  return { success: true, commandResult: makeCommandResult(cmd, [cmd.blockId, cmd.sectionId]) }
}

function handleRewriteBlock(cmd: Extract<WordoCommand, { type: 'rewrite_block' }>, orch: LayoutOrchestrator): ExecuteResult {
  const inst = orch.getSection(cmd.sectionId)
  if (!inst) return { success: false, error: `section not found: ${cmd.sectionId}` }

  const pos = findBlockPos(inst.state, cmd.blockId)
  if (pos === null) return { success: false, error: `block not found: ${cmd.blockId}` }

  const node = inst.state.doc.nodeAt(pos)!
  const newContent = textToPmContent(cmd.newText)
  const newNode = node.type.create(node.attrs, newContent)
  const tr = inst.state.tr.replaceWith(pos, pos + node.nodeSize, newNode)
  tr.setMeta('addToHistory', true)
  orch.applyTransaction(cmd.sectionId, tr)
  log.info('rewrite-block-ok', { sectionId: cmd.sectionId, blockId: cmd.blockId, textLength: cmd.newText.length })
  return { success: true, commandResult: makeCommandResult(cmd, [cmd.blockId, cmd.sectionId]) }
}

function handleUpdateBlock(cmd: Extract<WordoCommand, { type: 'update_block' }>, orch: LayoutOrchestrator): ExecuteResult {
  const inst = orch.getSection(cmd.sectionId)
  if (!inst) return { success: false, error: `section not found: ${cmd.sectionId}` }

  const pos = findBlockPos(inst.state, cmd.blockId)
  if (pos === null) return { success: false, error: `block not found: ${cmd.blockId}` }

  const node = inst.state.doc.nodeAt(pos)
  if (!node) return { success: false, error: `block not found: ${cmd.blockId}` }

  const patch = cmd.patch ?? {}
  const unsupportedWarnings = []
  const nextAttrs = { ...node.attrs }

  if (patch.alignment !== undefined) nextAttrs.textAlign = patch.alignment
  if (patch.lineSpacing !== undefined) nextAttrs.lineSpacing = toParagraphCssValue(patch.lineSpacing, '')
  if (patch.spaceBefore !== undefined) nextAttrs.spaceBefore = toParagraphCssValue(patch.spaceBefore)
  if (patch.spaceAfter !== undefined) nextAttrs.spaceAfter = toParagraphCssValue(patch.spaceAfter)
  if (patch.indentLevel !== undefined) nextAttrs.indentLeft = toIndentLeft(patch.indentLevel)
  if (patch.pageBreakBefore !== undefined) nextAttrs.pageBreakBefore = patch.pageBreakBefore
  if (patch.level !== undefined) {
    if (node.type.name === 'heading') nextAttrs.level = patch.level
    else {
      unsupportedWarnings.push(createDocumentWarning('update_block.level_ignored', 'Heading level patch only applies to heading blocks.', { objectId: cmd.blockId }))
    }
  }
  if (patch.styleId !== undefined) {
    unsupportedWarnings.push(createDocumentWarning('update_block.style_id_ignored', 'styleId patch is not yet wired into ProseMirror attrs.', { objectId: cmd.blockId }))
  }
  if (patch.layoutProps !== undefined) {
    unsupportedWarnings.push(createDocumentWarning('update_block.layout_props_ignored', 'layoutProps patch is not yet wired into ProseMirror attrs.', { objectId: cmd.blockId }))
  }
  if (patch.listType !== undefined) {
    unsupportedWarnings.push(createDocumentWarning('update_block.list_type_ignored', 'listType patch requires list structure conversion and is not implemented yet.', { objectId: cmd.blockId }))
  }

  const nextContent = patch.content
    ? runsToPmContent(patch.content)
    : patch.text !== undefined
      ? textToPmContent(patch.text)
      : node.content

  const replacement = node.type.create(nextAttrs, nextContent, node.marks)
  const tr = inst.state.tr.replaceWith(pos, pos + node.nodeSize, replacement)
  tr.setMeta('addToHistory', true)
  orch.applyTransaction(cmd.sectionId, tr)

  log.info('update-block-ok', {
    sectionId: cmd.sectionId,
    blockId: cmd.blockId,
    patchedKeys: Object.keys(patch),
  })

  return {
    success: true,
    commandResult: makeCommandResult(cmd, [cmd.blockId, cmd.sectionId], {
      warnings: unsupportedWarnings,
    }),
  }
}

function handleApplyStyle(cmd: Extract<WordoCommand, { type: 'apply_style' }>, orch: LayoutOrchestrator): ExecuteResult {
  // Style application is a future feature — log and acknowledge
  log.warn('apply-style-not-implemented', { styleId: cmd.styleId })
  return {
    success: false,
    error: 'apply_style not yet implemented',
    commandResult: makeCommandResult(cmd, [cmd.blockId, cmd.sectionId], {
      layoutImpact: 'none',
      warnings: [
        createDocumentWarning('apply_style_not_implemented', 'apply_style not yet implemented', {
          objectId: cmd.blockId,
          severity: 'warn',
        }),
      ],
    }),
  }
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
        result = handleUpdateBlock(command, orchestrator)
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
