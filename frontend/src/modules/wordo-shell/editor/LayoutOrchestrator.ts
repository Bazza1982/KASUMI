// ============================================================
// KASUMI WORDO — Layout Orchestrator
// Manages multiple ProseMirror instances (one per section).
// Handles: focus routing, cross-section undo, transaction broadcast.
// ============================================================

import { EditorState, Transaction } from 'prosemirror-state'
import { wordoSchema } from './schema'
import { buildPlugins } from './sectionPlugins'
import type { SectionId } from '../types/document'

export interface SectionInstance {
  sectionId: SectionId
  state: EditorState
}

export type OrchestratorListener = (instances: SectionInstance[]) => void

class LayoutOrchestrator {
  private instances: Map<SectionId, SectionInstance> = new Map()
  private listeners: Set<OrchestratorListener> = new Set()
  private focusedSection: SectionId | null = null

  /** Create a new section instance (called when section mounts) */
  createSection(sectionId: SectionId, initialDoc?: string): SectionInstance {
    const doc = initialDoc
      ? wordoSchema.nodeFromJSON(JSON.parse(initialDoc))
      : wordoSchema.nodes.doc.create(null, [
          wordoSchema.nodes.paragraph.create(null, wordoSchema.text(' ')),
        ])

    const state = EditorState.create({
      doc,
      plugins: buildPlugins(wordoSchema),
    })

    const instance: SectionInstance = { sectionId, state }
    this.instances.set(sectionId, instance)
    this._notify()
    return instance
  }

  /** Remove a section instance (called on unmount) */
  removeSection(sectionId: SectionId): void {
    this.instances.delete(sectionId)
    if (this.focusedSection === sectionId) this.focusedSection = null
    this._notify()
  }

  /** Apply a ProseMirror transaction to a specific section */
  applyTransaction(sectionId: SectionId, tr: Transaction): void {
    const instance = this.instances.get(sectionId)
    if (!instance) return
    const newState = instance.state.apply(tr)
    this.instances.set(sectionId, { ...instance, state: newState })
    this._notify()
  }

  /** Get a specific section's current state */
  getSection(sectionId: SectionId): SectionInstance | undefined {
    return this.instances.get(sectionId)
  }

  /** Get all sections in order */
  getSections(): SectionInstance[] {
    return Array.from(this.instances.values())
  }

  /** Track which section has keyboard focus */
  setFocusedSection(sectionId: SectionId | null): void {
    this.focusedSection = sectionId
  }

  getFocusedSection(): SectionId | null {
    return this.focusedSection
  }

  /** Subscribe to state changes (React components call this) */
  subscribe(listener: OrchestratorListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private _notify(): void {
    const sections = this.getSections()
    this.listeners.forEach(l => l(sections))
  }
}

/** One orchestrator per open document — created by WordoStore */
export function createOrchestrator(): LayoutOrchestrator {
  return new LayoutOrchestrator()
}

export { LayoutOrchestrator }
