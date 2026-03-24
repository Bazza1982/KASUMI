// ============================================================
// KASUMI WORDO — Block ID + Provenance Plugin
// Ensures every block-level node has a stable UUID.
// Also stamps createdAt/createdBy on new nodes and updates
// modifiedAt/modifiedBy when a block's content changes.
// ============================================================

import { Plugin, Transaction, EditorState } from 'prosemirror-state'
import { Node } from 'prosemirror-model'
import { createLogger } from './logger'

const log = createLogger('BlockId')

// Nodes that should carry block identity attrs
const TRACKED_BLOCK_TYPES = new Set([
  'paragraph', 'heading', 'blockquote', 'code_block',
  'bullet_list', 'ordered_list', 'list_item',
  'horizontal_rule', 'image', 'nexcel_embed',
])

function generateId(): string {
  // Use crypto.randomUUID if available (all modern browsers), fall back to timestamp+random
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return 'blk_' + crypto.randomUUID().slice(0, 8)
  }
  return 'blk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

interface NodeSnapshot {
  textContent: string
  childCount: number
}

function snapshotNode(node: Node): NodeSnapshot {
  return { textContent: node.textContent, childCount: node.childCount }
}

function snapshotsEqual(a: NodeSnapshot, b: NodeSnapshot): boolean {
  return a.textContent === b.textContent && a.childCount === b.childCount
}

// Collect block nodes and their positions from a doc
function collectBlocks(doc: Node): { node: Node; pos: number }[] {
  const blocks: { node: Node; pos: number }[] = []
  doc.descendants((node, pos) => {
    if (TRACKED_BLOCK_TYPES.has(node.type.name)) {
      blocks.push({ node, pos })
      return false // don't descend into block children (list items etc handled separately)
    }
    return true
  })
  return blocks
}

export function buildBlockIdPlugin(currentUser = 'user') {
  return new Plugin({
    appendTransaction(transactions, oldState, newState) {
      // Quick check: only proceed if something changed
      const docChanged = transactions.some(tr => tr.docChanged)
      if (!docChanged) return null

      const now = new Date().toISOString()
      const oldBlocks = new Map<string, NodeSnapshot>()

      // Snapshot old state's blocks by their existing IDs
      collectBlocks(oldState.doc).forEach(({ node }) => {
        if (node.attrs.id) {
          oldBlocks.set(node.attrs.id, snapshotNode(node))
        }
      })

      const newBlocks = collectBlocks(newState.doc)
      let fixCount = 0
      let modCount = 0

      // Collect changes needed — apply them all on a single transaction
      const pending: { pos: number; attrs: Record<string, unknown> }[] = []

      newBlocks.forEach(({ node, pos }) => {
        const needsId = !node.attrs.id
        const existingId = node.attrs.id as string | null
        const oldSnapshot = existingId ? oldBlocks.get(existingId) : undefined
        const currentSnapshot = snapshotNode(node)
        const contentChanged = oldSnapshot ? !snapshotsEqual(oldSnapshot, currentSnapshot) : false

        if (needsId) {
          const newId = generateId()
          pending.push({ pos, attrs: { ...node.attrs, id: newId, createdAt: now, createdBy: currentUser, modifiedAt: now, modifiedBy: currentUser } })
          log.debug('id-assigned', { nodeType: node.type.name, id: newId })
          fixCount++
        } else if (contentChanged) {
          pending.push({ pos, attrs: { ...node.attrs, modifiedAt: now, modifiedBy: currentUser } })
          log.debug('block-modified', { blockId: existingId, by: currentUser, at: now })
          modCount++
        }
      })

      if (pending.length > 0) {
        const tr = newState.tr
        pending.forEach(({ pos, attrs }) => tr.setNodeMarkup(pos, undefined, attrs))
        tr.setMeta('blockIdPlugin', true)
        if (fixCount > 0) log.info('ids-assigned', { count: fixCount })
        if (modCount > 0) log.debug('provenance-updated', { count: modCount })
        return tr
      }

      return null
    },
  })
}
