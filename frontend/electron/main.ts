import { app, BrowserWindow, Menu, ipcMain, dialog, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Paths ─────────────────────────────────────────────────────────────────────
// In dev:  dist-electron/main.js → renderer served by Vite dev server
// In prod: dist-electron/main.js → renderer at dist/index.html
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const RENDERER_DIST = path.join(__dirname, '../dist')

let mainWindow: BrowserWindow | null = null

// ── Create window ─────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'KASUMI',
    // Use a simple colored title bar — replace with custom icon once logo is designed
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    // Hide default menu bar — we build our own via Menu.setApplicationMenu
    autoHideMenuBar: false,
    show: false,   // show only after ready-to-show to prevent blank flash
  })

  // Graceful show
  mainWindow.once('ready-to-show', () => {
    mainWindow!.show()
  })

  // Load app
  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
    // Uncomment to open DevTools in dev:
    // mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  // Open external links in the system browser, not Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── Native Menu ───────────────────────────────────────────────────────────────
function buildMenu() {
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    // macOS app menu
    ...(isMac ? [{ label: app.name, submenu: [
      { role: 'about' as const },
      { type: 'separator' as const },
      { role: 'services' as const },
      { type: 'separator' as const },
      { role: 'hide' as const },
      { role: 'hideOthers' as const },
      { role: 'unhide' as const },
      { type: 'separator' as const },
      { role: 'quit' as const },
    ]}] : []),

    // File
    {
      label: 'File',
      submenu: [
        {
          label: 'New Document',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:new-document'),
        },
        { type: 'separator' },
        {
          label: 'Import .docx…',
          accelerator: 'CmdOrCtrl+O',
          click: () => handleImportDocx(),
        },
        {
          label: 'Export .docx…',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu:export-docx'),
        },
        {
          label: 'Export PDF…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow?.webContents.send('menu:export-pdf'),
        },
        { type: 'separator' },
        {
          label: 'Import CSV…',
          click: () => handleImportCsv(),
        },
        {
          label: 'Export CSV…',
          click: () => mainWindow?.webContents.send('menu:export-csv'),
        },
        {
          label: 'Export XLSX…',
          click: () => mainWindow?.webContents.send('menu:export-xlsx'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' as const } : { role: 'quit' as const },
      ],
    },

    // Edit
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const },
      ],
    },

    // View
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { type: 'separator' },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' },
        { role: 'togglefullscreen' as const },
        ...(process.env.NODE_ENV === 'development' ? [
          { type: 'separator' as const },
          { role: 'toggleDevTools' as const },
        ] : []),
      ],
    },

    // Help
    {
      role: 'help' as const,
      submenu: [
        {
          label: 'About KASUMI',
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: 'About KASUMI',
              message: 'KASUMI Platform',
              detail: `Version ${app.getVersion()}\nIntelligent Workspace Platform\n\nKASUMI Nexcel + KASUMI WORDO`,
            })
          },
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── IPC: Native file dialogs ──────────────────────────────────────────────────

/** Show open dialog → read file → send bytes to renderer */
async function handleImportDocx() {
  if (!mainWindow) return
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import .docx',
    filters: [{ name: 'Word Document', extensions: ['docx'] }],
    properties: ['openFile'],
  })
  if (result.canceled || !result.filePaths[0]) return
  const filePath = result.filePaths[0]
  const buffer = fs.readFileSync(filePath)
  mainWindow.webContents.send('menu:import-docx', {
    name: path.basename(filePath),
    buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  })
}

async function handleImportCsv() {
  if (!mainWindow) return
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import CSV',
    filters: [{ name: 'CSV', extensions: ['csv'] }],
    properties: ['openFile'],
  })
  if (result.canceled || !result.filePaths[0]) return
  const text = fs.readFileSync(result.filePaths[0], 'utf-8')
  mainWindow.webContents.send('menu:import-csv', { text, name: path.basename(result.filePaths[0]) })
}

/** Renderer sends file bytes → show save dialog → write to disk */
ipcMain.handle('dialog:save-file', async (_event, args: {
  defaultName: string
  filters: { name: string; extensions: string[] }[]
  buffer: ArrayBuffer
}) => {
  if (!mainWindow) return { canceled: true }
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: args.defaultName,
    filters: args.filters,
  })
  if (result.canceled || !result.filePath) return { canceled: true }
  fs.writeFileSync(result.filePath, Buffer.from(args.buffer))
  return { canceled: false, filePath: result.filePath }
})
