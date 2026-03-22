/**
 * useNativeBridge — unified file I/O for Electron (native dialogs) and browser (fallback)
 *
 * In Electron: calls window.kasumi IPC, which opens native OS dialogs and reads/writes
 *              files directly on disk — no browser download tricks needed.
 *
 * In browser:  falls back to the classic <a download> / file <input> pattern so the
 *              web version continues to work during development.
 */

// Detect Electron at runtime (set in preload.ts via contextBridge)
const isElectron = (): boolean =>
  typeof window !== 'undefined' && !!(window as any).kasumi?.isElectron

// ── Save file ─────────────────────────────────────────────────────────────────

export interface SaveOptions {
  defaultName: string
  /** e.g. [{ name: 'Word Document', extensions: ['docx'] }] */
  filters: { name: string; extensions: string[] }[]
  data: ArrayBuffer | Blob
}

export async function saveFile(opts: SaveOptions): Promise<boolean> {
  const buffer = opts.data instanceof Blob
    ? await opts.data.arrayBuffer()
    : opts.data

  if (isElectron()) {
    const result = await (window as any).kasumi.saveFile(opts.defaultName, opts.filters, buffer)
    return !result.canceled
  }

  // Browser fallback
  const blob = new Blob([buffer])
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = opts.defaultName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return true
}

// ── Open file (browser-only; Electron opens via menu IPC) ────────────────────

export function openFilePicker(
  accept: string,
  onFile: (file: File) => void
): void {
  if (isElectron()) {
    // In Electron, file open is triggered by the native menu → IPC → renderer listener.
    // This function is a no-op in Electron — use onImportDocx / onImportCsv listeners instead.
    console.warn('[useNativeBridge] openFilePicker called in Electron — use native menu instead')
    return
  }
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = accept
  input.onchange = () => {
    if (input.files?.[0]) onFile(input.files[0])
  }
  input.click()
}

// ── Menu listeners (Electron only) ───────────────────────────────────────────

type Unsubscribe = () => void

export function onMenuExportDocx(cb: () => void): Unsubscribe {
  if (!isElectron()) return () => {}
  ;(window as any).kasumi.onExportDocx(cb)
  return () => {} // electron ipcRenderer.on doesn't expose removeListener here; acceptable for single-window app
}

export function onMenuExportPdf(cb: () => void): Unsubscribe {
  if (!isElectron()) return () => {}
  ;(window as any).kasumi.onExportPdf(cb)
  return () => {}
}

export function onMenuExportCsv(cb: () => void): Unsubscribe {
  if (!isElectron()) return () => {}
  ;(window as any).kasumi.onExportCsv(cb)
  return () => {}
}

export function onMenuExportXlsx(cb: () => void): Unsubscribe {
  if (!isElectron()) return () => {}
  ;(window as any).kasumi.onExportXlsx(cb)
  return () => {}
}

export function onMenuImportDocx(
  cb: (payload: { name: string; buffer: ArrayBuffer }) => void
): Unsubscribe {
  if (!isElectron()) return () => {}
  ;(window as any).kasumi.onImportDocx(cb)
  return () => {}
}

export function onMenuImportCsv(
  cb: (payload: { name: string; text: string }) => void
): Unsubscribe {
  if (!isElectron()) return () => {}
  ;(window as any).kasumi.onImportCsv(cb)
  return () => {}
}

export function onMenuNewDocument(cb: () => void): Unsubscribe {
  if (!isElectron()) return () => {}
  ;(window as any).kasumi.onNewDocument(cb)
  return () => {}
}
