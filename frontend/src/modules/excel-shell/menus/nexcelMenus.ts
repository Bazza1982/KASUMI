/**
 * Nexcel menu definitions.
 * Each menu maps to the items that appear in the dropdown.
 *
 * Actions reference store functions passed in via `ctx`.
 * This keeps the menu data pure (no React hooks here).
 */
import type { MenuItem } from '../../../shared/DropdownMenu'

export interface NexcelMenuContext {
  // Store actions
  newSheet: () => void
  undo: () => void
  redo: () => void
  addRow: () => void
  deleteSelectedRows: () => void
  addColumn: () => void
  deleteColumn: () => void
  cutCells: () => void
  exportToCsv: () => void
  exportToXlsx: () => void
  importFromCsv: () => void
  importFromXlsx: () => void
  toggleSort: (direction: 'asc' | 'desc') => void
  deduplicateRows: () => void
  toggleFreezeFirstRow: () => void
  toggleFreezeFirstCol: () => void
  setZoomLevel: (z: number) => void
  zoomLevel: number
  frozenRowCount: number
  frozenColCount: number
  onHelp: () => void
  onPrint: () => void
  onToggleComments: () => void
  onConditionalFormat: () => void

  // Clipboard (browser native)
  copySelection: () => void
  pasteSelection: () => void
}

export const buildNexcelMenus = (ctx: NexcelMenuContext): Record<string, MenuItem[]> => ({
  File: [
    { label: 'New Workbook',       shortcut: 'Ctrl+N',       action: ctx.newSheet },
    { label: '---' },
    { label: 'Import CSV…',                                   action: ctx.importFromCsv },
    { label: 'Import XLSX…',                                  action: ctx.importFromXlsx },
    { label: '---' },
    { label: 'Export as CSV',                                 action: ctx.exportToCsv },
    { label: 'Export as XLSX',                                action: ctx.exportToXlsx },
    { label: '---' },
    { label: 'Print…',            shortcut: 'Ctrl+P',       action: ctx.onPrint },
  ],

  Home: [
    { label: 'Undo',              shortcut: 'Ctrl+Z',       action: ctx.undo },
    { label: 'Redo',              shortcut: 'Ctrl+Y',       action: ctx.redo },
    { label: '---' },
    { label: 'Cut',               shortcut: 'Ctrl+X',       action: ctx.cutCells },
    { label: 'Copy',              shortcut: 'Ctrl+C',       action: ctx.copySelection },
    { label: 'Paste',             shortcut: 'Ctrl+V',       action: ctx.pasteSelection },
    { label: '---' },
    { label: 'Conditional Formatting…',                      action: ctx.onConditionalFormat },
  ],

  Insert: [
    { label: 'Insert Row',        shortcut: 'Ctrl+Shift+N', action: ctx.addRow },
    { label: 'Delete Row(s)',     shortcut: 'Ctrl+Shift+D', action: ctx.deleteSelectedRows },
    { label: '---' },
    { label: 'Insert Column',                                 action: ctx.addColumn },
    { label: 'Delete Column',                                 action: ctx.deleteColumn },
  ],

  'Page Layout': [
    {
      label: frozenLabel('Freeze Top Row', ctx.frozenRowCount > 0),
      action: ctx.toggleFreezeFirstRow,
    },
    {
      label: frozenLabel('Freeze First Column', ctx.frozenColCount > 0),
      action: ctx.toggleFreezeFirstCol,
    },
    { label: '---' },
    {
      label: 'Zoom',
      submenu: [50, 75, 100, 125, 150, 200].map(pct => ({
        label: `${pct}%${ctx.zoomLevel === pct / 100 ? ' ✓' : ''}`,
        action: () => ctx.setZoomLevel(pct / 100),
      })),
    },
  ],

  Formulas: [
    { label: 'AI Formula Assistant', disabled: true },
    { label: '(Coming in v2.0)',      disabled: true },
  ],

  Data: [
    { label: 'Sort Ascending',     action: () => ctx.toggleSort('asc') },
    { label: 'Sort Descending',    action: () => ctx.toggleSort('desc') },
    { label: '---' },
    { label: 'Remove Duplicates',  action: ctx.deduplicateRows },
    { label: '---' },
    { label: 'Import CSV…',        action: ctx.importFromCsv },
    { label: 'Import XLSX…',       action: ctx.importFromXlsx },
    { label: '---' },
    { label: 'Export as CSV',      action: ctx.exportToCsv },
    { label: 'Export as XLSX',     action: ctx.exportToXlsx },
  ],

  Review: [
    { label: 'Toggle Comments Panel', action: ctx.onToggleComments },
  ],

  View: [
    {
      label: frozenLabel('Freeze Top Row', ctx.frozenRowCount > 0),
      action: ctx.toggleFreezeFirstRow,
    },
    {
      label: frozenLabel('Freeze First Column', ctx.frozenColCount > 0),
      action: ctx.toggleFreezeFirstCol,
    },
    { label: '---' },
    {
      label: 'Zoom',
      submenu: [50, 75, 100, 125, 150, 200].map(pct => ({
        label: `${pct}%${ctx.zoomLevel === pct / 100 ? ' ✓' : ''}`,
        action: () => ctx.setZoomLevel(pct / 100),
      })),
    },
  ],

  Help: [
    { label: 'Keyboard Shortcuts', shortcut: 'F1', action: ctx.onHelp },
    { label: '---' },
    { label: 'About Kasumi', action: () => alert('Kasumi v1.0 — AI-native desktop workbench') },
  ],
})

function frozenLabel(base: string, active: boolean): string {
  return active ? `${base} ✓` : base
}
