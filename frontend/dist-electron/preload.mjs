"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("kasumi", {
  // ── File I/O ────────────────────────────────────────────────────────────────
  /** Save any file via native Save dialog. Returns true if saved. */
  saveFile: (defaultName, filters, buffer) => electron.ipcRenderer.invoke("dialog:save-file", { defaultName, filters, buffer }),
  // ── Menu event listeners ────────────────────────────────────────────────────
  // Renderer registers these to handle native menu actions
  onNewDocument: (cb) => electron.ipcRenderer.on("menu:new-document", () => cb()),
  onExportDocx: (cb) => electron.ipcRenderer.on("menu:export-docx", () => cb()),
  onExportPdf: (cb) => electron.ipcRenderer.on("menu:export-pdf", () => cb()),
  onExportCsv: (cb) => electron.ipcRenderer.on("menu:export-csv", () => cb()),
  onExportXlsx: (cb) => electron.ipcRenderer.on("menu:export-xlsx", () => cb()),
  onImportDocx: (cb) => electron.ipcRenderer.on("menu:import-docx", (_event, payload) => cb(payload)),
  onImportCsv: (cb) => electron.ipcRenderer.on("menu:import-csv", (_event, payload) => cb(payload)),
  // ── Environment ─────────────────────────────────────────────────────────────
  /** True when running inside Electron (not in browser) */
  isElectron: true
});
