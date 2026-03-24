import { create } from 'zustand'
import { NexcelLogger } from '../services/logger'

export interface CellChange {
  id: string
  cellRef: string        // "rowId:fieldId"
  fieldId: number
  rowId: number
  oldValue: unknown
  newValue: unknown
  author: string
  timestamp: string
  source: 'user_edit' | 'paste' | 'fill' | 'import'
}

interface CellChangeState {
  changes: CellChange[]
  recordChange: (change: Omit<CellChange, 'id' | 'timestamp' | 'author'>) => void
  getChangesForCell: (cellRef: string) => CellChange[]
  getChangesForRow: (rowId: number) => CellChange[]
  getRecentChanges: (limit?: number) => CellChange[]
  persist: () => void
  load: () => void
}

const STORAGE_KEY = 'kasumi_nexcel_changes'
const MAX_ENTRIES = 1000

function uuid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export const useCellChangeStore = create<CellChangeState>((set, get) => ({
  changes: [],

  recordChange: (change) => {
    const entry: CellChange = {
      ...change,
      id: uuid(),
      author: 'user',
      timestamp: new Date().toISOString()
    }
    set(s => {
      const changes = [entry, ...s.changes].slice(0, MAX_ENTRIES)
      return { changes }
    })
    NexcelLogger.changeLog('debug', 'recorded', { cellRef: change.cellRef, source: change.source })
    get().persist()
  },

  getChangesForCell: (cellRef) => get().changes.filter(c => c.cellRef === cellRef),
  getChangesForRow: (rowId) => get().changes.filter(c => c.rowId === rowId),
  getRecentChanges: (limit = 50) => get().changes.slice(0, limit),

  persist: () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(get().changes)) }
    catch (e) { NexcelLogger.changeLog('error', 'persistFailed', { error: String(e) }) }
  },

  load: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) set({ changes: JSON.parse(raw) })
      NexcelLogger.changeLog('info', 'loaded', { count: get().changes.length })
    } catch (e) { NexcelLogger.changeLog('error', 'loadFailed', { error: String(e) }) }
  }
}))
