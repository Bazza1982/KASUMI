/**
 * TypeScript declarations for the KASUMI native bridge (window.kasumi)
 * Injected by electron/preload.ts via contextBridge when running in Electron.
 * In browser builds this object is undefined — always guard with isElectron().
 */

interface KasumiNativeBridge {
  readonly isElectron: true

  /** Save a file via native OS dialog. Returns { canceled: boolean, filePath?: string } */
  saveFile(
    defaultName: string,
    filters: { name: string; extensions: string[] }[],
    buffer: ArrayBuffer
  ): Promise<{ canceled: boolean; filePath?: string }>

  // Menu event listeners
  onNewDocument(cb: () => void): void
  onExportDocx(cb: () => void): void
  onExportPdf(cb: () => void): void
  onExportCsv(cb: () => void): void
  onExportXlsx(cb: () => void): void
  onImportDocx(cb: (payload: { name: string; buffer: ArrayBuffer }) => void): void
  onImportCsv(cb: (payload: { name: string; text: string }) => void): void
}

declare global {
  interface Window {
    kasumi?: KasumiNativeBridge
  }
}

export {}
