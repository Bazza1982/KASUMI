import { app, BrowserWindow, dialog, Menu, ipcMain, shell } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const RENDERER_DIST = path.join(__dirname$1, "../dist");
let mainWindow = null;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "KASUMI",
    // Use a simple colored title bar — replace with custom icon once logo is designed
    backgroundColor: "#1a1a2e",
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false
    },
    // Hide default menu bar — we build our own via Menu.setApplicationMenu
    autoHideMenuBar: false,
    show: false
    // show only after ready-to-show to prevent blank flash
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });
  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    // macOS app menu
    ...isMac ? [{ label: app.name, submenu: [
      { role: "about" },
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" }
    ] }] : [],
    // File
    {
      label: "File",
      submenu: [
        {
          label: "New Document",
          accelerator: "CmdOrCtrl+N",
          click: () => mainWindow == null ? void 0 : mainWindow.webContents.send("menu:new-document")
        },
        { type: "separator" },
        {
          label: "Import .docx…",
          accelerator: "CmdOrCtrl+O",
          click: () => handleImportDocx()
        },
        {
          label: "Export .docx…",
          accelerator: "CmdOrCtrl+S",
          click: () => mainWindow == null ? void 0 : mainWindow.webContents.send("menu:export-docx")
        },
        {
          label: "Export PDF…",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => mainWindow == null ? void 0 : mainWindow.webContents.send("menu:export-pdf")
        },
        { type: "separator" },
        {
          label: "Import CSV…",
          click: () => handleImportCsv()
        },
        {
          label: "Export CSV…",
          click: () => mainWindow == null ? void 0 : mainWindow.webContents.send("menu:export-csv")
        },
        {
          label: "Export XLSX…",
          click: () => mainWindow == null ? void 0 : mainWindow.webContents.send("menu:export-xlsx")
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" }
      ]
    },
    // Edit
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    // View
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...process.env.NODE_ENV === "development" ? [
          { type: "separator" },
          { role: "toggleDevTools" }
        ] : []
      ]
    },
    // Help
    {
      role: "help",
      submenu: [
        {
          label: "About KASUMI",
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "About KASUMI",
              message: "KASUMI Platform",
              detail: `Version ${app.getVersion()}
Intelligent Workspace Platform

KASUMI Nexcel + KASUMI WORDO`
            });
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
async function handleImportDocx() {
  if (!mainWindow) return;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Import .docx",
    filters: [{ name: "Word Document", extensions: ["docx"] }],
    properties: ["openFile"]
  });
  if (result.canceled || !result.filePaths[0]) return;
  const filePath = result.filePaths[0];
  const buffer = fs.readFileSync(filePath);
  mainWindow.webContents.send("menu:import-docx", {
    name: path.basename(filePath),
    buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  });
}
async function handleImportCsv() {
  if (!mainWindow) return;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Import CSV",
    filters: [{ name: "CSV", extensions: ["csv"] }],
    properties: ["openFile"]
  });
  if (result.canceled || !result.filePaths[0]) return;
  const text = fs.readFileSync(result.filePaths[0], "utf-8");
  mainWindow.webContents.send("menu:import-csv", { text, name: path.basename(result.filePaths[0]) });
}
ipcMain.handle("dialog:save-file", async (_event, args) => {
  if (!mainWindow) return { canceled: true };
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: args.defaultName,
    filters: args.filters
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  fs.writeFileSync(result.filePath, Buffer.from(args.buffer));
  return { canceled: false, filePath: result.filePath };
});
