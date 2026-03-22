// ============================================================
// KASUMI WORDO — Header / Footer Editor
// Each section gets its own header and footer zone.
// Click to activate; a separate lightweight ProseMirror instance
// is used so content is isolated from the body editor.
// ============================================================

import React, { useEffect, useRef, useState } from 'react'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { history, undo, redo } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap, toggleMark } from 'prosemirror-commands'
import { wordoSchema } from './schema'

interface HFEditorProps {
  zone: 'header' | 'footer'
  pageNumber: number
  totalPages: number
  height: number    // px
  paddingH: number  // left/right padding (px) — matches body margins
}

function buildHFState() {
  return EditorState.create({
    schema: wordoSchema,
    plugins: [
      history(),
      keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Mod-b': toggleMark(wordoSchema.marks.strong), 'Mod-i': toggleMark(wordoSchema.marks.em) }),
      keymap(baseKeymap),
    ],
  })
}

export const HeaderFooterEditor: React.FC<HFEditorProps> = ({
  zone, pageNumber, totalPages, height, paddingH,
}) => {
  const mountRef = useRef<HTMLDivElement>(null)
  const viewRef  = useRef<EditorView | null>(null)
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!active || !mountRef.current) return
    if (viewRef.current) return  // already mounted

    const state = buildHFState()
    const view = new EditorView(mountRef.current, {
      state,
      dispatchTransaction(tr) {
        view.updateState(view.state.apply(tr))
      },
    })
    viewRef.current = view
    view.focus()

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [active])

  // Page number placeholder (right-aligned)
  const pageNumText = `${pageNumber} / ${totalPages}`

  return (
    <div
      style={{
        height,
        paddingLeft: paddingH,
        paddingRight: paddingH,
        display: 'flex',
        alignItems: 'center',
        position: 'relative',
        cursor: active ? 'text' : 'pointer',
        borderTop: zone === 'footer' ? '1px solid #d0d7de' : 'none',
        borderBottom: zone === 'header' ? '1px solid #d0d7de' : 'none',
        background: active ? '#f8faff' : 'transparent',
        transition: 'background 0.1s',
      }}
      onClick={() => !active && setActive(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setActive(false)
        }
      }}
      tabIndex={-1}
    >
      {active ? (
        /* Active: ProseMirror editing surface */
        <div style={{ flex: 1, fontSize: 11, fontStyle: 'normal' }}>
          <div
            ref={mountRef}
            className="wordo-hf-surface"
            style={{ outline: 'none', fontSize: 11, fontFamily: '"Calibri", Arial, sans-serif', color: '#333' }}
          />
        </div>
      ) : (
        /* Inactive: placeholder */
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#bbb', fontSize: 10, fontStyle: 'italic' }}>
            {zone === 'header' ? 'Header — click to edit' : 'Footer — click to edit'}
          </span>
          {zone === 'footer' && (
            <span style={{ color: '#bbb', fontSize: 10 }}>{pageNumText}</span>
          )}
        </div>
      )}

      {/* Zone label badge */}
      {active && (
        <div style={{
          position: 'absolute',
          [zone === 'header' ? 'bottom' : 'top']: -16,
          left: paddingH,
          fontSize: 9, color: '#4f8ef7', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
          pointerEvents: 'none',
        }}>
          {zone} ·
          <button
            style={{ marginLeft: 6, fontSize: 9, border: 'none', background: 'transparent', color: '#999', cursor: 'pointer', padding: 0 }}
            onMouseDown={(e) => { e.preventDefault(); setActive(false) }}
          >
            Close ✕
          </button>
        </div>
      )}
    </div>
  )
}
