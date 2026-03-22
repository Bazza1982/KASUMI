// ============================================================
// KASUMI WORDO — Access Store
// Extends the platform access-control with WORDO-specific caps.
// Stored separately so Nexcel and WORDO can have independent modes.
// ============================================================

import { create } from 'zustand'
import type { AccessMode } from '../../../platform/types'

export interface WordoCapabilities {
  // Content editing
  canEditBody: boolean          // type / edit body text
  canInsertBlocks: boolean      // tables, images, nexcel embeds
  canDeleteBlocks: boolean      // delete blocks
  canFillBindings: boolean      // fill placeholder data bindings

  // Structure
  canInsertSections: boolean    // add/remove sections
  canEditHeaderFooter: boolean  // modify headers/footers
  canSetWatermark: boolean      // watermark settings
  canSetPageStyle: boolean      // margins, paper, orientation

  // Template / schema
  canModifyStyles: boolean      // change style registry
  canModifyTemplate: boolean    // restructure template

  // Export / import
  canExport: boolean
  canImport: boolean
}

const CAPABILITIES: Record<AccessMode, WordoCapabilities> = {
  'data-entry': {
    canEditBody:         true,
    canInsertBlocks:     false,
    canDeleteBlocks:     false,
    canFillBindings:     true,
    canInsertSections:   false,
    canEditHeaderFooter: false,
    canSetWatermark:     false,
    canSetPageStyle:     false,
    canModifyStyles:     false,
    canModifyTemplate:   false,
    canExport:           false,
    canImport:           false,
  },
  'analyst': {
    canEditBody:         true,
    canInsertBlocks:     true,
    canDeleteBlocks:     true,
    canFillBindings:     true,
    canInsertSections:   true,
    canEditHeaderFooter: true,
    canSetWatermark:     false,
    canSetPageStyle:     true,
    canModifyStyles:     false,
    canModifyTemplate:   false,
    canExport:           true,
    canImport:           true,
  },
  'admin': {
    canEditBody:         true,
    canInsertBlocks:     true,
    canDeleteBlocks:     true,
    canFillBindings:     true,
    canInsertSections:   true,
    canEditHeaderFooter: true,
    canSetWatermark:     true,
    canSetPageStyle:     true,
    canModifyStyles:     true,
    canModifyTemplate:   true,
    canExport:           true,
    canImport:           true,
  },
}

const STORAGE_KEY = 'kasumi_wordo_access_mode'

const savedMode = (typeof localStorage !== 'undefined'
  ? localStorage.getItem(STORAGE_KEY)
  : null) as AccessMode | null

const initialMode: AccessMode =
  savedMode && ['data-entry', 'analyst', 'admin'].includes(savedMode)
    ? savedMode
    : 'analyst'

interface WordoAccessState extends WordoCapabilities {
  mode: AccessMode
  setMode: (mode: AccessMode) => void
}

export const useWordoAccessStore = create<WordoAccessState>((set) => ({
  mode: initialMode,
  ...CAPABILITIES[initialMode],

  setMode: (mode) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, mode)
    }
    set({ mode, ...CAPABILITIES[mode] })
  },
}))
