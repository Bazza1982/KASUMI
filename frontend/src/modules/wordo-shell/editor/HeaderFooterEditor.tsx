// ============================================================
// KASUMI WORDO — Header / Footer Editor
// Each section gets its own header and footer zone.
// Click to activate; a separate lightweight ProseMirror instance
// is used so content is isolated from the body editor.
// ============================================================

import React, { useEffect, useRef, useState } from 'react'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { wordoSchema } from './schema'
import { buildPlugins } from './sectionPlugins'
import { useWordoStore } from '../stores/useWordoStore'
import { createSemanticId, type HeaderFooter, type HeaderFooterVariant } from '../types/document'

interface HFEditorProps {
  sectionId: string
  zone: 'header' | 'footer'
  value?: HeaderFooter
  inheritedValue?: HeaderFooter
  hasPreviousSection: boolean
  differentFirstPage?: boolean
  differentOddEven?: boolean
  pageNumber: number
  totalPages: number
  height: number    // px
  paddingH: number  // left/right padding (px) — matches body margins
  readOnly?: boolean
}

function buildHFState(pmDocJson?: object) {
  let doc
  try {
    doc = pmDocJson ? wordoSchema.nodeFromJSON(pmDocJson) : wordoSchema.nodes.doc.createAndFill()
  } catch {
    doc = wordoSchema.nodes.doc.createAndFill()
  }
  return EditorState.create({
    schema: wordoSchema,
    doc: doc ?? wordoSchema.nodes.doc.create(),
    plugins: buildPlugins(wordoSchema),
  })
}

function extractPreviewText(pmDocJson?: object): string {
  if (!pmDocJson) return ''
  try {
    return wordoSchema.nodeFromJSON(pmDocJson).textContent.replace(/\s+/g, ' ').trim()
  } catch {
    return ''
  }
}

function getVariantDoc(value: HeaderFooter | undefined, variant: HeaderFooterVariant): object | undefined {
  if (!value) return undefined
  if (variant === 'default') return value.variantDocs?.default ?? value.pmDocJson
  return value.variantDocs?.[variant]
}

function getVariantPreview(value: HeaderFooter | undefined, variant: HeaderFooterVariant): string {
  if (!value) return ''
  if (variant === 'default') return value.variantPreviewText?.default ?? value.previewText ?? extractPreviewText(getVariantDoc(value, 'default'))
  return value.variantPreviewText?.[variant] ?? extractPreviewText(getVariantDoc(value, variant))
}

export const HeaderFooterEditor: React.FC<HFEditorProps> = ({
  sectionId, zone, value, inheritedValue, hasPreviousSection, differentFirstPage = false, differentOddEven = false,
  pageNumber, totalPages, height, paddingH, readOnly = false,
}) => {
  const mountRef = useRef<HTMLDivElement>(null)
  const viewRef  = useRef<EditorView | null>(null)
  const [active, setActive] = useState(false)
  const [variant, setVariant] = useState<HeaderFooterVariant>('default')
  const updateSectionHeaderFooter = useWordoStore(s => s.updateSectionHeaderFooter)
  const updateSectionHeaderFooterLink = useWordoStore(s => s.updateSectionHeaderFooterLink)
  const triggerAutoSave = useWordoStore(s => s.triggerAutoSave)
  const availableVariants: HeaderFooterVariant[] = ['default', ...(differentFirstPage ? ['first' as const] : []), ...(differentOddEven ? ['even' as const] : [])]
  const linkToPrevious = hasPreviousSection && (value?.linkToPrevious?.[variant] ?? !value)
  const activeValue = linkToPrevious ? inheritedValue : value
  const activeDocJson = getVariantDoc(activeValue, variant)

  useEffect(() => {
    if (readOnly || !active || !mountRef.current) return
    if (viewRef.current) return  // already mounted

    const state = buildHFState(activeDocJson)
    const view = new EditorView(mountRef.current, {
      state,
      dispatchTransaction(tr) {
        const nextState = view.state.apply(tr)
        view.updateState(nextState)
        const nextJson = nextState.doc.toJSON()
        updateSectionHeaderFooter(sectionId, zone, {
          ...value,
          id: value?.id ?? createSemanticId(`hf_${zone}`),
          default: value?.default ?? [],
          pmDocJson: nextJson,
          previewText: extractPreviewText(nextJson),
          linkToPrevious: {
            ...value?.linkToPrevious,
            [variant]: false,
          },
        }, variant)
        triggerAutoSave()
      },
      editable: () => !readOnly && !linkToPrevious,
    })
    viewRef.current = view
    view.focus()

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [active, activeDocJson, linkToPrevious, readOnly, sectionId, triggerAutoSave, updateSectionHeaderFooter, value, variant, zone])

  useEffect(() => {
    if (!active || !viewRef.current) return
    const nextJson = JSON.stringify(activeDocJson ?? null)
    const currentJson = JSON.stringify(viewRef.current.state.doc.toJSON())
    if (nextJson === currentJson) return
    viewRef.current.updateState(buildHFState(activeDocJson))
  }, [active, activeDocJson])

  useEffect(() => {
    if (availableVariants.includes(variant)) return
    setVariant('default')
  }, [availableVariants, variant])

  const handleToggleLink = (nextLinked: boolean) => {
    const nextValue = value ?? {
      id: createSemanticId(`hf_${zone}`),
      default: [],
    }

    if (!nextLinked) {
      const inheritedDoc = getVariantDoc(inheritedValue, variant)
      const inheritedPreview = getVariantPreview(inheritedValue, variant)
      updateSectionHeaderFooter(sectionId, zone, {
        ...nextValue,
        pmDocJson: inheritedDoc ?? wordoSchema.nodes.doc.createAndFill()?.toJSON(),
        previewText: inheritedPreview,
        variantDocs: {
          ...nextValue.variantDocs,
          [variant]: inheritedDoc ?? wordoSchema.nodes.doc.createAndFill()?.toJSON(),
        },
        variantPreviewText: {
          ...nextValue.variantPreviewText,
          [variant]: inheritedPreview,
        },
        linkToPrevious: {
          ...nextValue.linkToPrevious,
          [variant]: false,
        },
      }, variant)
    }

    updateSectionHeaderFooterLink(sectionId, zone, variant, nextLinked)
    triggerAutoSave()
  }

  // Page number placeholder (right-aligned)
  const pageNumText = `${pageNumber} / ${totalPages}`
  const previewText = getVariantPreview(activeValue, variant).trim()
  const placeholderText = linkToPrevious
    ? 'Linked to previous section'
    : zone === 'header'
      ? 'Header — click to edit'
      : 'Footer — click to edit'

  return (
    <div
      style={{
        height,
        paddingLeft: paddingH,
        paddingRight: paddingH,
        display: 'flex',
        alignItems: 'center',
        position: 'relative',
        cursor: readOnly ? 'default' : active ? 'text' : 'pointer',
        borderTop: zone === 'footer' ? '1px solid #d0d7de' : 'none',
        borderBottom: zone === 'header' ? '1px solid #d0d7de' : 'none',
        background: active ? '#f8faff' : 'transparent',
        transition: 'background 0.1s',
      }}
      onClick={() => !readOnly && !active && !linkToPrevious && setActive(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setActive(false)
        }
      }}
      tabIndex={-1}
    >
      <div style={{
        position: 'absolute',
        top: 2,
        right: paddingH,
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        zIndex: 2,
      }}>
        {availableVariants.map(item => (
          <button
            key={item}
            type="button"
            data-testid={`wordo-${zone}-${item}-tab-${sectionId}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setVariant(item); setActive(false) }}
            style={{
              border: 'none',
              background: item === variant ? '#dbeafe' : 'transparent',
              color: item === variant ? '#1d4ed8' : '#94a3b8',
              fontSize: 9,
              textTransform: 'uppercase',
              borderRadius: 999,
              padding: '1px 6px',
              cursor: 'pointer',
            }}
          >
            {item}
          </button>
        ))}
        {hasPreviousSection && (
          <label style={{ fontSize: 9, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="checkbox"
              checked={linkToPrevious}
              onChange={(e) => handleToggleLink(e.target.checked)}
            />
            Link
          </label>
        )}
      </div>
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
          <span
            data-testid={`wordo-${zone}-preview-${variant}-${sectionId}`}
            style={{ color: previewText ? '#667085' : '#bbb', fontSize: 10, fontStyle: previewText ? 'normal' : 'italic', paddingRight: 110 }}
          >
            {previewText || placeholderText}
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
          {zone} · {variant} ·
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
