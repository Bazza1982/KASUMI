// ============================================================
// KASUMI WORDO — Track Change Store
// Manages tracking state and the change registry.
// The actual mark application is done by trackChangePlugin.
// Accept/Reject operations dispatch PM transactions.
// ============================================================

import { create } from 'zustand'
import { createLogger } from '../editor/logger'

const log = createLogger('TrackChange')

export interface ChangeRecord {
  changeId: string
  type: 'insert' | 'delete'
  author: string
  timestamp: string
  /** Plain text of the affected range (snapshot at record time) */
  text: string
  sectionId: string
  blockId: string
}

interface TrackChangeState {
  enabled: boolean
  author: string
  changes: Map<string, ChangeRecord>

  toggleTracking: () => void
  setEnabled: (enabled: boolean) => void
  setAuthor: (name: string) => void

  /** Called by trackChangePlugin to register a new change */
  registerChange: (record: ChangeRecord) => void
  /** Called by accept/reject handlers after PM transaction succeeds */
  removeChange: (changeId: string) => void

  getChange: (changeId: string) => ChangeRecord | undefined
  getAllChanges: () => ChangeRecord[]
}

export const useTrackChangeStore = create<TrackChangeState>((set, get) => ({
  enabled: false,
  author: 'user',
  changes: new Map(),

  toggleTracking() {
    const next = !get().enabled
    set({ enabled: next })
    log.info(next ? 'tracking-enabled' : 'tracking-disabled', { author: get().author })
  },

  setEnabled(enabled) {
    set({ enabled })
    log.info(enabled ? 'tracking-enabled' : 'tracking-disabled', { author: get().author })
  },

  setAuthor(name) {
    set({ author: name })
    log.info('author-set', { author: name })
  },

  registerChange(record) {
    set(state => {
      const next = new Map(state.changes)
      next.set(record.changeId, record)
      return { changes: next }
    })
    log.info('change-registered', {
      changeId: record.changeId,
      type: record.type,
      author: record.author,
      text: record.text.slice(0, 40),
    })
  },

  removeChange(changeId) {
    if (!get().changes.has(changeId)) {
      log.warn('remove-change-not-found', { changeId })
      return
    }
    set(state => {
      const next = new Map(state.changes)
      next.delete(changeId)
      return { changes: next }
    })
    log.debug('change-removed', { changeId })
  },

  getChange: (changeId) => get().changes.get(changeId),
  getAllChanges: () => Array.from(get().changes.values()),
}))
