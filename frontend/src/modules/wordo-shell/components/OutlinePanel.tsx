// Left outline panel — shows sections and heading structure
import React, { useEffect, useState } from 'react'
import { useWordoStore } from '../stores/useWordoStore'
import type { SectionInstance } from '../editor/LayoutOrchestrator'

interface HeadingEntry {
  text: string
  level: number
  sectionId: string
}

function extractHeadings(instances: SectionInstance[]): HeadingEntry[] {
  const entries: HeadingEntry[] = []
  for (const inst of instances) {
    inst.state.doc.descendants(node => {
      if (node.type.name === 'heading') {
        entries.push({
          text: node.textContent || '(empty heading)',
          level: node.attrs['level'] as number,
          sectionId: inst.sectionId,
        })
      }
    })
  }
  return entries
}

export const OutlinePanel: React.FC = () => {
  const { orchestrator, document: doc } = useWordoStore()
  const [headings, setHeadings] = useState<HeadingEntry[]>([])

  useEffect(() => {
    const unsubscribe = orchestrator.subscribe(instances => {
      setHeadings(extractHeadings(instances))
    })
    // Initial
    setHeadings(extractHeadings(orchestrator.getSections()))
    return unsubscribe
  }, [orchestrator])

  const scrollToSection = (sectionId: string) => {
    const el = document.querySelector(`[data-section-id="${sectionId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div style={{
      width: 200, flexShrink: 0,
      background: '#fafafa', borderRight: '1px solid #e0e0e0',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #e0e0e0', fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Document Outline
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {/* Section entries */}
        {doc.sections.map((sec, idx) => (
          <div key={sec.id}>
            {/* Section header */}
            <div
              onClick={() => scrollToSection(sec.id)}
              style={{ padding: '4px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#4f8ef7', display: 'flex', alignItems: 'center', gap: 6 }}
              onMouseEnter={e => (e.currentTarget.style.background = '#e8f0fe')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: 9, opacity: 0.7 }}>§</span>
              Section {idx + 1}
            </div>

            {/* Headings in this section */}
            {headings.filter(h => h.sectionId === sec.id).map((h, hi) => (
              <div
                key={hi}
                onClick={() => scrollToSection(sec.id)}
                title={h.text}
                style={{
                  padding: `2px 12px 2px ${12 + (h.level - 1) * 10}px`,
                  cursor: 'pointer', fontSize: 11,
                  color: h.level <= 2 ? '#1a1a2e' : '#4a5568',
                  fontWeight: h.level <= 2 ? 600 : 400,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f0f0f0')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {h.text}
              </div>
            ))}
          </div>
        ))}

        {headings.length === 0 && (
          <div style={{ padding: '12px', color: '#bbb', fontSize: 11, textAlign: 'center' }}>
            Type headings to see<br />outline here
          </div>
        )}
      </div>
    </div>
  )
}
