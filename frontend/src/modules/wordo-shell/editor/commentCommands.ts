// ============================================================
// KASUMI WORDO — Comment Commands
// Functions to add/remove comment_ref marks from PM state.
// ============================================================

import { EditorState, Transaction } from 'prosemirror-state'
import { wordoSchema } from './schema'
import { createLogger } from './logger'

const log = createLogger('Comment')

/**
 * Apply a comment_ref mark to the current selection.
 * Returns a transaction to dispatch, or null if selection is empty.
 */
export function addCommentMark(state: EditorState, commentId: string): Transaction | null {
  const { from, to } = state.selection
  if (from === to) {
    log.warn('add-comment-mark-failed', { reason: 'empty selection', commentId })
    return null
  }
  const mark = wordoSchema.marks.comment_ref.create({ commentId })
  const tr = state.tr.addMark(from, to, mark)
  tr.setMeta('addToHistory', false)
  log.debug('comment-mark-applied', { commentId, from, to })
  return tr
}

/**
 * Remove all comment_ref marks for a given commentId from the document.
 * Returns a transaction to dispatch.
 */
export function removeCommentMark(state: EditorState, commentId: string): Transaction {
  const tr = state.tr
  state.doc.descendants((node, pos) => {
    node.marks.forEach(mark => {
      if (mark.type === wordoSchema.marks.comment_ref && mark.attrs.commentId === commentId) {
        tr.removeMark(pos, pos + node.nodeSize, wordoSchema.marks.comment_ref)
      }
    })
  })
  tr.setMeta('addToHistory', false)
  log.debug('comment-mark-removed', { commentId })
  return tr
}

/**
 * Get the selected text from an EditorState (for use as anchor text).
 */
export function getSelectedText(state: EditorState): string {
  const { from, to } = state.selection
  return state.doc.textBetween(from, to, ' ')
}

/**
 * Get the block ID of the node at the start of the selection.
 */
export function getSelectionBlockId(state: EditorState): string | null {
  const { from } = state.selection
  const resolved = state.doc.resolve(from)
  for (let d = resolved.depth; d >= 0; d--) {
    const node = resolved.node(d)
    if (node.attrs?.id) return node.attrs.id as string
  }
  return null
}
