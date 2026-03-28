import React, { useState, useCallback, useMemo } from 'react'
import type { Node as PmNode } from 'prosemirror-model'
import { useWordoStore } from '../stores/useWordoStore'
import type { LayoutOrchestrator } from '../editor/LayoutOrchestrator'

interface Props {
  onClose: () => void
}

interface Match {
  sectionId: string
  from: number
  to: number
}

function findAllMatches(
  orchestrator: LayoutOrchestrator,
  sections: { id: string }[],
  query: string,
  caseSensitive: boolean,
): Match[] {
  if (!query) return []
  const matches: Match[] = []
  const normalQ = caseSensitive ? query : query.toLowerCase()
  sections.forEach(section => {
    const inst = orchestrator.getSection(section.id)
    if (!inst) return
    inst.state.doc.descendants((node: PmNode, pos: number) => {
      if (!node.isText || !node.text) return
      const text = caseSensitive ? node.text : node.text.toLowerCase()
      let idx = 0
      while ((idx = text.indexOf(normalQ, idx)) !== -1) {
        matches.push({ sectionId: section.id, from: pos + idx, to: pos + idx + query.length })
        idx += query.length
      }
    })
  })
  return matches
}

export const FindReplacePanel: React.FC<Props> = ({ onClose }) => {
  const { orchestrator, document: doc } = useWordoStore()
  const [query, setQuery] = useState('')
  const [replaceWith, setReplaceWith] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(0)

  const matches = useMemo(
    () => findAllMatches(orchestrator, doc.sections, query, caseSensitive),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, caseSensitive, doc.sections, orchestrator],
  )

  const handleReplaceNext = useCallback(() => {
    if (!query || !replaceWith || matches.length === 0) return
    const idx = currentIdx % matches.length
    const m = matches[idx]
    const inst = orchestrator.getSection(m.sectionId)
    if (!inst) return
    const tr = inst.state.tr.replaceWith(m.from, m.to, inst.state.schema.text(replaceWith))
    orchestrator.applyTransaction(m.sectionId, tr)
    // After replacement, move to next (matches will recompute, keep same relative index)
    setCurrentIdx(i => (i + 1) % Math.max(matches.length - 1, 1))
  }, [query, replaceWith, matches, currentIdx, orchestrator])

  const handleReplaceAll = useCallback(() => {
    if (!query || !replaceWith) return
    doc.sections.forEach(section => {
      const inst = orchestrator.getSection(section.id)
      if (!inst) return
      const sectionMatches = matches.filter(m => m.sectionId === section.id)
      if (sectionMatches.length === 0) return
      let tr = inst.state.tr
      ;[...sectionMatches].reverse().forEach(({ from, to }) => {
        tr = tr.replaceWith(from, to, inst.state.schema.text(replaceWith))
      })
      orchestrator.applyTransaction(section.id, tr)
    })
    setCurrentIdx(0)
  }, [query, replaceWith, matches, doc.sections, orchestrator])

  const inputStyle: React.CSSProperties = {
    display: 'block', width: '100%', marginTop: 3, padding: '5px 8px',
    border: '1px solid #d0d7de', borderRadius: 4, fontSize: 13, boxSizing: 'border-box',
  }
  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    padding: '5px 10px', border: 'none', borderRadius: 4,
    background: '#7c3aed', color: '#fff', cursor: disabled ? 'default' : 'pointer',
    fontSize: 12, fontWeight: 600, opacity: disabled ? 0.5 : 1,
  })

  return (
    <div style={{
      position: 'fixed', top: 80, right: 20, zIndex: 500,
      background: '#fff', border: '1px solid #d0d7de', borderRadius: 8,
      padding: 16, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 340,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Find & Replace</span>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, color: '#666' }}>×</button>
      </div>

      <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
        Find
        <input value={query} onChange={e => { setQuery(e.target.value); setCurrentIdx(0) }} autoFocus style={inputStyle} />
      </label>

      {/* Case sensitive toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#555', marginBottom: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={caseSensitive} onChange={e => setCaseSensitive(e.target.checked)} />
        Case sensitive
        {query && (
          <span style={{ marginLeft: 'auto', color: matches.length ? '#7c3aed' : '#999' }}>
            {matches.length} match{matches.length !== 1 ? 'es' : ''}
          </span>
        )}
      </label>

      <label style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
        Replace with
        <input value={replaceWith} onChange={e => setReplaceWith(e.target.value)} style={inputStyle} />
      </label>

      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button
          onClick={handleReplaceNext}
          disabled={!query || !replaceWith || matches.length === 0}
          style={btnStyle(!query || !replaceWith || matches.length === 0)}
        >Replace</button>
        <button
          onClick={handleReplaceAll}
          disabled={!query || !replaceWith || matches.length === 0}
          style={btnStyle(!query || !replaceWith || matches.length === 0)}
        >Replace All</button>
      </div>
    </div>
  )
}
