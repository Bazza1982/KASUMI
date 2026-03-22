import { contextBridge, ipcRenderer } from 'electron'

// ── KASUMI Native Bridge ───────────────────────────────────────────────────────
// Exposed to renderer as window.kasumi
// All calls are async and validated through contextBridge (no nodeIntegration needed)

contextBridge.exposeInMainWorld('kasumi', {
  // ── File I/O ────────────────────────────────────────────────────────────────

  /** Save any file via native Save dialog. Returns true if saved. */
  saveFile: (defaultName: string, filters: { name: string; extensions: string[] }[], buffer: ArrayBuffer) =>
    ipcRenderer.invoke('dialog:save-file', { defaultName, filters, buffer }),

  // ── Menu event listeners ────────────────────────────────────────────────────
  // Renderer registers these to handle native menu actions

  onNewDocument:  (cb: () => void) =>
    ipcRenderer.on('menu:new-document', () => cb()),

  onExportDocx:   (cb: () => void) =>
    ipcRenderer.on('menu:export-docx', () => cb()),

  onExportPdf:    (cb: () => void) =>
    ipcRenderer.on('menu:export-pdf', () => cb()),

  onExportCsv:    (cb: () => void) =>
    ipcRenderer.on('menu:export-csv', () => cb()),

  onExportXlsx:   (cb: () => void) =>
    ipcRenderer.on('menu:export-xlsx', () => cb()),

  onImportDocx:   (cb: (payload: { name: string; buffer: ArrayBuffer }) => void) =>
    ipcRenderer.on('menu:import-docx', (_event, payload) => cb(payload)),

  onImportCsv:    (cb: (payload: { name: string; text: string }) => void) =>
    ipcRenderer.on('menu:import-csv', (_event, payload) => cb(payload)),

  // ── Environment ─────────────────────────────────────────────────────────────

  /** True when running inside Electron (not in browser) */
  isElectron: true as const,
})
