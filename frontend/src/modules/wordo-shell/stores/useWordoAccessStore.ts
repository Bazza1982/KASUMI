// ============================================================
// KASUMI WORDO — Access Store
// WORDO follows a Word-style model: if a user can open the document,
// they can fully edit it. Access control happens before the document
// is opened, not inside the editor surface.
// ============================================================

import { create } from 'zustand'

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

const DEFAULT_CAPABILITIES: WordoCapabilities = {
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
}

export const useWordoAccessStore = create<WordoCapabilities>(() => DEFAULT_CAPABILITIES)
