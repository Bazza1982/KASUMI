import React, { useState } from 'react'
import { useConditionalFormatStore, type ConditionType } from '../stores/useConditionalFormatStore'
import type { CellFormat } from '../stores/useCellFormatStore'
import { NexcelLogger } from '../services/logger'

interface Props {
  fieldId: number
  fieldName: string
  isOpen: boolean
  onClose: () => void
}

const CONDITION_LABELS: Record<ConditionType, string> = {
  equals: 'Equals',
  contains: 'Contains',
  gt: 'Greater than',
  lt: 'Less than',
  is_empty: 'Is empty',
  not_empty: 'Is not empty',
}

const CONDITION_OPTIONS = Object.entries(CONDITION_LABELS) as [ConditionType, string][]

const BG_COLORS = [
  { color: '#fef08a', label: 'Yellow' },
  { color: '#fca5a5', label: 'Red' },
  { color: '#86efac', label: 'Green' },
  { color: '#93c5fd', label: 'Blue' },
  { color: '#e9d5ff', label: 'Purple' },
  { color: undefined, label: 'None' },
]

const TEXT_COLORS = [
  { color: '#dc2626', label: 'Red' },
  { color: '#16a34a', label: 'Green' },
  { color: '#2563eb', label: 'Blue' },
  { color: '#7c3aed', label: 'Purple' },
  { color: '#000000', label: 'Black' },
  { color: undefined, label: 'None' },
]

const defaultNewRule = (): { condition: ConditionType; value: string; format: CellFormat } => ({
  condition: 'contains',
  value: '',
  format: {},
})

const ConditionalFormatDialog: React.FC<Props> = ({ fieldId, fieldName, isOpen, onClose }) => {
  const { getRulesForField, addRule, deleteRule } = useConditionalFormatStore()
  const [newRule, setNewRule] = useState(defaultNewRule())
  const [showAdd, setShowAdd] = useState(false)

  if (!isOpen) return null

  const rules = getRulesForField(fieldId)

  const handleAdd = () => {
    addRule({
      fieldId,
      condition: newRule.condition,
      value: newRule.value,
      format: newRule.format,
      priority: rules.length,
    })
    NexcelLogger.formatting('info', 'conditionalRule:addedViaDialog', { fieldId, condition: newRule.condition })
    setNewRule(defaultNewRule())
    setShowAdd(false)
  }

  const needsValue = newRule.condition !== 'is_empty' && newRule.condition !== 'not_empty'

  const conditionLabel = (cond: ConditionType, val: string) => {
    const base = CONDITION_LABELS[cond] ?? cond
    if (cond === 'is_empty' || cond === 'not_empty') return base
    return `${base}: "${val}"`
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 5000,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white', borderRadius: 8, padding: 20,
          width: 480, maxHeight: '80vh', overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
            Conditional Formatting — {fieldName}
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#666', lineHeight: 1 }}
          >×</button>
        </div>

        {/* Existing rules */}
        {rules.length === 0 && !showAdd && (
          <p style={{ color: '#888', fontSize: 13, margin: '8px 0 16px' }}>No rules yet. Add one below.</p>
        )}
        {rules.map(rule => (
          <div
            key={rule.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', borderRadius: 6, marginBottom: 6,
              border: '1px solid #e1dfdd', background: '#fafafa',
            }}
          >
            {/* Format preview swatch */}
            <div style={{
              width: 28, height: 28, borderRadius: 4, border: '1px solid #ccc', flexShrink: 0,
              background: rule.format.bgColor ?? 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                fontSize: 11, fontWeight: rule.format.bold ? 'bold' : 'normal',
                fontStyle: rule.format.italic ? 'italic' : 'normal',
                color: rule.format.textColor ?? '#333',
              }}>A</span>
            </div>
            <span style={{ flex: 1, fontSize: 13, color: '#333' }}>
              {conditionLabel(rule.condition, rule.value)}
            </span>
            <button
              onClick={() => deleteRule(rule.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#dc2626', fontSize: 18, lineHeight: 1, padding: '0 2px',
              }}
              title="Delete rule"
            >×</button>
          </div>
        ))}

        {/* Add rule form */}
        {showAdd ? (
          <div style={{ border: '1px solid #217346', borderRadius: 6, padding: 14, marginTop: 8 }}>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Condition</label>
              <select
                value={newRule.condition}
                onChange={e => setNewRule(r => ({ ...r, condition: e.target.value as ConditionType }))}
                style={{ width: '100%', padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
              >
                {CONDITION_OPTIONS.map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            {needsValue && (
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Value</label>
                <input
                  type="text"
                  value={newRule.value}
                  onChange={e => setNewRule(r => ({ ...r, value: e.target.value }))}
                  placeholder="Enter value..."
                  style={{ width: '100%', padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
            )}

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 6 }}>Background color</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {BG_COLORS.map(({ color, label }) => (
                  <button
                    key={label}
                    title={label}
                    onClick={() => setNewRule(r => ({ ...r, format: { ...r.format, bgColor: color } }))}
                    style={{
                      width: 24, height: 24, borderRadius: 4, cursor: 'pointer', padding: 0,
                      background: color ?? 'white',
                      border: newRule.format.bgColor === color
                        ? '2px solid #217346'
                        : '1.5px solid #ccc',
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 6 }}>Text color</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TEXT_COLORS.map(({ color, label }) => (
                  <button
                    key={label}
                    title={label}
                    onClick={() => setNewRule(r => ({ ...r, format: { ...r.format, textColor: color } }))}
                    style={{
                      width: 24, height: 24, borderRadius: 4, cursor: 'pointer', padding: 0,
                      background: color ?? 'white',
                      border: newRule.format.textColor === color
                        ? '2px solid #217346'
                        : '1.5px solid #ccc',
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!newRule.format.bold}
                  onChange={e => setNewRule(r => ({ ...r, format: { ...r.format, bold: e.target.checked || undefined } }))}
                />
                Bold
              </label>
            </div>

            {/* Format preview */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Preview</label>
              <div style={{
                padding: '4px 10px', borderRadius: 4, border: '1px solid #ccc', display: 'inline-block',
                background: newRule.format.bgColor ?? 'white',
                color: newRule.format.textColor ?? '#333',
                fontWeight: newRule.format.bold ? 'bold' : 'normal',
                fontSize: 13,
              }}>
                Sample text
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleAdd}
                style={{
                  padding: '6px 16px', borderRadius: 4, border: 'none', cursor: 'pointer',
                  background: '#217346', color: 'white', fontSize: 13, fontWeight: 500,
                }}
              >
                Add Rule
              </button>
              <button
                onClick={() => { setShowAdd(false); setNewRule(defaultNewRule()) }}
                style={{
                  padding: '6px 16px', borderRadius: 4, border: '1px solid #ccc', cursor: 'pointer',
                  background: 'white', color: '#333', fontSize: 13,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            style={{
              marginTop: 8, padding: '6px 16px', borderRadius: 4,
              border: '1px dashed #217346', cursor: 'pointer',
              background: 'transparent', color: '#217346', fontSize: 13,
              width: '100%',
            }}
          >
            + Add Rule
          </button>
        )}
      </div>
    </div>
  )
}

export default ConditionalFormatDialog
