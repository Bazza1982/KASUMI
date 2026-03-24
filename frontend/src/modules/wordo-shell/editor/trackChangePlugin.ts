// ============================================================
// KASUMI WORDO — Track Change Plugin
// Intercepts ProseMirror transactions when tracking is enabled.
// Insertions → wrapped in track_insert mark.
// Deletions → re-inserted with track_delete mark instead of removed.
//
// Simplification (v1): handles single-range insert/delete only.
// Complex operations (multi-step, paste) are passed through unmodified
// and logged for future handling.
// ============================================================

import { Plugin, PluginKey, Transaction, EditorState } from 'prosemirror-state'
import { ReplaceStep, ReplaceAroundStep } from 'prosemirror-transform'
import { Slice, Fragment } from 'prosemirror-model'
import { wordoSchema } from './schema'
import { createLogger } from './logger'
import { useTrackChangeStore } from '../stores/useTrackChangeStore'

const log = createLogger('TrackChange')

export const trackChangePluginKey = new PluginKey<{ enabled: boolean; author: string }>('trackChange')

function generateChangeId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return 'chg_' + crypto.randomUUID().slice(0, 8)
  }
  return 'chg_' + Date.now().toString(36)
}

/**
 * Get the block ID at a given document position.
 */
function blockIdAt(state: EditorState, pos: number): string {
  const resolved = state.doc.resolve(Math.min(pos, state.doc.content.size - 1))
  for (let d = resolved.depth; d >= 0; d--) {
    const node = resolved.node(d)
    if (node.attrs?.id) return node.attrs.id as string
  }
  return ''
}

export function buildTrackChangePlugin() {
  return new Plugin({
    key: trackChangePluginKey,

    state: {
      init: () => ({ enabled: false, author: 'user' }),
      apply(tr, value) {
        // Allow external code to update tracking state via meta
        const meta = tr.getMeta(trackChangePluginKey)
        if (meta) return { ...value, ...meta }
        return value
      },
    },

    // filterTransaction: called before appendTransaction.
    // We don't filter — we let all transactions through but transform them in appendTransaction.
    // Exception: transactions tagged as track-change operations (avoid re-processing).
    filterTransaction(tr) {
      if (tr.getMeta('trackChange') || tr.getMeta('blockIdPlugin')) return true
      return true  // always allow
    },

    appendTransaction(transactions, oldState, newState) {
      // Check if tracking is enabled (read from Zustand store — simple and direct)
      const store = useTrackChangeStore.getState()
      if (!store.enabled) return null

      // Skip our own track-change transactions to prevent infinite loops
      if (transactions.some(tr => tr.getMeta('trackChange'))) return null
      // Skip block ID plugin transactions
      if (transactions.some(tr => tr.getMeta('blockIdPlugin'))) return null
      // Skip transactions that didn't change the doc
      if (!transactions.some(tr => tr.docChanged)) return null

      // For v1: handle only single-step, single-range transactions.
      // This covers the most common case: user types or deletes a selection.
      const userTr = transactions.find(tr => tr.docChanged && !tr.getMeta('trackChange') && !tr.getMeta('blockIdPlugin'))
      if (!userTr) return null
      if (userTr.steps.length !== 1) {
        log.debug('multi-step-transaction-skipped', { stepCount: userTr.steps.length, reason: 'v1 only handles single step' })
        return null
      }

      const step = userTr.steps[0]
      if (!(step instanceof ReplaceStep)) {
        log.debug('non-replace-step-skipped', { stepType: step.constructor.name })
        return null
      }

      const replaceStep = step as ReplaceStep
      const { from, to } = replaceStep
      const insertedSlice: Slice = (replaceStep as any).slice ?? Slice.empty
      const hasInsertion = insertedSlice.content.size > 0
      const hasDeletion = from < to  // range was deleted from oldState

      // Build a corrective transaction on oldState that achieves the same result
      // but wraps inserted text in track_insert and restores deleted text with track_delete.
      if (!hasInsertion && !hasDeletion) return null

      const now = new Date().toISOString()
      const { author } = store
      const blockId = blockIdAt(oldState, from)

      let tr = newState.tr
      tr.setMeta('trackChange', true)
      tr.setMeta('addToHistory', false)

      if (hasDeletion) {
        // Get deleted text from oldState
        const deletedText = oldState.doc.textBetween(from, to, ' ')
        if (deletedText.trim()) {
          const changeId = generateChangeId()
          const deleteMark = wordoSchema.marks.track_delete.create({
            changeId,
            author,
            timestamp: now,
            originalText: deletedText,
          })

          // The text is already gone in newState — we need to re-insert it with the mark.
          // After the original transaction, `from` is where the deleted range started.
          // Since the original step deleted content, `from` in newState points to where
          // the deletion happened. We insert the deleted text back there with track_delete mark.
          const deletedContent = oldState.doc.slice(from, to)
          // Build a text node with track_delete mark for each leaf text node
          let insertFragment = Fragment.empty
          deletedContent.content.descendants((node) => {
            if (node.isText && node.text) {
              const marksWithDelete = [...node.marks, deleteMark]
              insertFragment = insertFragment.addToEnd(
                wordoSchema.text(node.text, marksWithDelete)
              )
            }
          })

          if (insertFragment.size > 0) {
            tr = tr.insert(from, insertFragment)
            store.registerChange({ changeId, type: 'delete', author, timestamp: now, text: deletedText, sectionId: '', blockId })
            log.info('delete-tracked', { changeId, text: deletedText.slice(0, 40), from, to })
          }
        }
      }

      if (hasInsertion) {
        // Find the inserted range in newState after our re-insertion above.
        // After re-inserting deleted text at `from`, the inserted content is offset.
        const insertOffset = hasDeletion ? (oldState.doc.textBetween(from, to, ' ')).length : 0
        const insertFrom = from + insertOffset
        const insertTo = insertFrom + insertedSlice.content.size

        const insertedText = newState.doc.textBetween(
          Math.min(from, newState.doc.content.size),
          Math.min(from + insertedSlice.content.size, newState.doc.content.size),
          ' '
        )

        if (insertedText.trim()) {
          const changeId = generateChangeId()
          const insertMark = wordoSchema.marks.track_insert.create({ changeId, author, timestamp: now })
          tr = tr.addMark(insertFrom, insertTo, insertMark)
          store.registerChange({ changeId, type: 'insert', author, timestamp: now, text: insertedText, sectionId: '', blockId })
          log.info('insert-tracked', { changeId, text: insertedText.slice(0, 40), from: insertFrom, to: insertTo })
        }
      }

      return tr
    },
  })
}

// ── Accept / Reject helpers ───────────────────────────────────
// These run against the current EditorState and return a Transaction.

/**
 * Accept an insertion: remove the track_insert mark, keep the text.
 */
export function acceptInsert(state: EditorState, changeId: string): Transaction | null {
  let found = false
  const tr = state.tr
  state.doc.descendants((node, pos) => {
    node.marks.forEach(mark => {
      if (mark.type.name === 'track_insert' && mark.attrs.changeId === changeId) {
        tr.removeMark(pos, pos + node.nodeSize, wordoSchema.marks.track_insert)
        found = true
      }
    })
  })
  if (!found) {
    log.warn('accept-insert-not-found', { changeId })
    return null
  }
  tr.setMeta('trackChange', true)
  tr.setMeta('addToHistory', true)
  log.info('change-accepted', { changeId, type: 'insert' })
  return tr
}

/**
 * Reject an insertion: delete the text that has track_insert mark.
 */
export function rejectInsert(state: EditorState, changeId: string): Transaction | null {
  const ranges: { from: number; to: number }[] = []
  state.doc.descendants((node, pos) => {
    if (node.isText) {
      node.marks.forEach(mark => {
        if (mark.type.name === 'track_insert' && mark.attrs.changeId === changeId) {
          ranges.push({ from: pos, to: pos + node.nodeSize })
        }
      })
    }
  })
  if (ranges.length === 0) {
    log.warn('reject-insert-not-found', { changeId })
    return null
  }
  const tr = state.tr
  // Delete in reverse order to keep positions valid
  ranges.sort((a, b) => b.from - a.from).forEach(r => tr.delete(r.from, r.to))
  tr.setMeta('trackChange', true)
  tr.setMeta('addToHistory', true)
  log.info('change-rejected', { changeId, type: 'insert' })
  return tr
}

/**
 * Accept a deletion: remove the track_delete marked text (confirm it's gone).
 */
export function acceptDelete(state: EditorState, changeId: string): Transaction | null {
  const ranges: { from: number; to: number }[] = []
  state.doc.descendants((node, pos) => {
    if (node.isText) {
      node.marks.forEach(mark => {
        if (mark.type.name === 'track_delete' && mark.attrs.changeId === changeId) {
          ranges.push({ from: pos, to: pos + node.nodeSize })
        }
      })
    }
  })
  if (ranges.length === 0) {
    log.warn('accept-delete-not-found', { changeId })
    return null
  }
  const tr = state.tr
  ranges.sort((a, b) => b.from - a.from).forEach(r => tr.delete(r.from, r.to))
  tr.setMeta('trackChange', true)
  tr.setMeta('addToHistory', true)
  log.info('change-accepted', { changeId, type: 'delete' })
  return tr
}

/**
 * Reject a deletion: restore the deleted text (remove track_delete mark).
 */
export function rejectDelete(state: EditorState, changeId: string): Transaction | null {
  let found = false
  const tr = state.tr
  state.doc.descendants((node, pos) => {
    node.marks.forEach(mark => {
      if (mark.type.name === 'track_delete' && mark.attrs.changeId === changeId) {
        tr.removeMark(pos, pos + node.nodeSize, wordoSchema.marks.track_delete)
        found = true
      }
    })
  })
  if (!found) {
    log.warn('reject-delete-not-found', { changeId })
    return null
  }
  tr.setMeta('trackChange', true)
  tr.setMeta('addToHistory', true)
  log.info('change-rejected', { changeId, type: 'delete' })
  return tr
}
