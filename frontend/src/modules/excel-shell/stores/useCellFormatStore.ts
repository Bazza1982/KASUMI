import { create } from 'zustand'
import { NexcelLogger } from '../services/logger'

export interface CellFormat {
  bgColor?: string
  textColor?: string
  bold?: boolean
  italic?: boolean
  align?: 'left' | 'center' | 'right'
}

type FormatMap = Record<string, CellFormat>  // key = "rowId:fieldId"

interface CellFormatState {
  formats: FormatMap
  setFormat: (cellRef: string, format: Partial<CellFormat>) => void
  setFormatRange: (cellRefs: string[], format: Partial<CellFormat>) => void
  getFormat: (cellRef: string) => CellFormat | null
  clearFormat: (cellRef: string) => void
  clearFormatRange: (cellRefs: string[]) => void
  persist: () => void
  load: () => void
}

const STORAGE_KEY = 'kasumi_nexcel_formats'

export const useCellFormatStore = create<CellFormatState>((set, get) => ({
  formats: {},

  setFormat: (cellRef, format) => {
    set(s => ({
      formats: { ...s.formats, [cellRef]: { ...s.formats[cellRef], ...format } }
    }))
    NexcelLogger.formatting('debug', 'setFormat', { cellRef, format })
    get().persist()
  },

  setFormatRange: (cellRefs, format) => {
    set(s => {
      const updated = { ...s.formats }
      for (const ref of cellRefs) updated[ref] = { ...updated[ref], ...format }
      return { formats: updated }
    })
    NexcelLogger.formatting('info', 'setFormatRange', { count: cellRefs.length, format })
    get().persist()
  },

  getFormat: (cellRef) => get().formats[cellRef] ?? null,

  clearFormat: (cellRef) => {
    set(s => { const f = { ...s.formats }; delete f[cellRef]; return { formats: f } })
    get().persist()
  },

  clearFormatRange: (cellRefs) => {
    set(s => {
      const f = { ...s.formats }
      for (const ref of cellRefs) delete f[ref]
      return { formats: f }
    })
    get().persist()
  },

  persist: () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(get().formats)) }
    catch (e) { NexcelLogger.formatting('error', 'persistFailed', { error: String(e) }) }
  },

  load: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) set({ formats: JSON.parse(raw) })
      NexcelLogger.formatting('info', 'loaded', { keys: Object.keys(get().formats).length })
    } catch (e) { NexcelLogger.formatting('error', 'loadFailed', { error: String(e) }) }
  }
}))
