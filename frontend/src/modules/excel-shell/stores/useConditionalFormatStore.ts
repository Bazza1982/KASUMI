import { create } from 'zustand'
import { NexcelLogger } from '../services/logger'
import type { CellFormat } from './useCellFormatStore'

export type ConditionType = 'equals' | 'contains' | 'gt' | 'lt' | 'is_empty' | 'not_empty'

export interface ConditionalFormatRule {
  id: string
  fieldId: number
  condition: ConditionType
  value: string
  format: CellFormat
  priority: number
}

interface ConditionalFormatState {
  rules: ConditionalFormatRule[]
  addRule: (rule: Omit<ConditionalFormatRule, 'id'>) => void
  updateRule: (id: string, updates: Partial<ConditionalFormatRule>) => void
  deleteRule: (id: string) => void
  getRulesForField: (fieldId: number) => ConditionalFormatRule[]
  evaluateCell: (fieldId: number, value: unknown) => CellFormat | null
  reset: () => void
  persist: () => void
  load: () => void
}

const STORAGE_KEY = 'kasumi_nexcel_conditional_formats'

function uuid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

function matchesCondition(condition: ConditionType, cellValue: unknown, ruleValue: string): boolean {
  const str = String(cellValue ?? '').toLowerCase()
  const rv = ruleValue.toLowerCase()
  switch (condition) {
    case 'equals': return str === rv
    case 'contains': return str.includes(rv)
    case 'gt': return Number(cellValue) > Number(ruleValue)
    case 'lt': return Number(cellValue) < Number(ruleValue)
    case 'is_empty': return cellValue === null || cellValue === undefined || str === ''
    case 'not_empty': return cellValue !== null && cellValue !== undefined && str !== ''
    default: return false
  }
}

export const useConditionalFormatStore = create<ConditionalFormatState>((set, get) => ({
  rules: [],

  addRule: (rule) => {
    const newRule = { ...rule, id: uuid() }
    set(s => ({ rules: [...s.rules, newRule] }))
    NexcelLogger.formatting('info', 'conditionalRule:added', { fieldId: rule.fieldId, condition: rule.condition })
    get().persist()
  },

  updateRule: (id, updates) => {
    set(s => ({ rules: s.rules.map(r => r.id === id ? { ...r, ...updates } : r) }))
    get().persist()
  },

  deleteRule: (id) => {
    set(s => ({ rules: s.rules.filter(r => r.id !== id) }))
    get().persist()
  },

  getRulesForField: (fieldId) =>
    get().rules.filter(r => r.fieldId === fieldId).sort((a, b) => a.priority - b.priority),

  evaluateCell: (fieldId, value) => {
    const rules = get().getRulesForField(fieldId)
    for (const rule of rules) {
      if (matchesCondition(rule.condition, value, rule.value)) {
        NexcelLogger.formatting('debug', 'conditionalRule:match', { fieldId, ruleId: rule.id })
        return rule.format
      }
    }
    return null
  },

  reset: () => {
    set({ rules: [] })
    get().persist()
  },

  persist: () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(get().rules)) }
    catch (e) { NexcelLogger.formatting('error', 'conditionalPersistFailed', { error: String(e) }) }
  },

  load: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) set({ rules: JSON.parse(raw) })
      NexcelLogger.formatting('info', 'conditionalLoaded', { count: get().rules.length })
    } catch (e) { NexcelLogger.formatting('error', 'conditionalLoadFailed', { error: String(e) }) }
  }
}))
