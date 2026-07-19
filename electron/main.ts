import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { BuildProgress, BuildRequest, PublishRequest } from '../src/types.js'
import { buildPack, scanSource } from './packBuilder.js'
import { publishPack } from './publisher.js'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const rendererDirectory = path.join(currentDirectory, '../dist')

app.setName('EmpiPack Studio')

function reportProgress(progress: BuildProgress) {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('studio:build-progress', progress)
  }
}

function registerIpcHandlers() {
  ipcMain.handle('studio:choose-source', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Elige la instancia que quieres convertir en modpack',
      buttonLabel: 'Usar esta instancia',
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    return await scanSource(result.filePaths[0])
  })

  ipcMain.handle('studio:choose-output', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Elige donde guardar el paquete terminado',
      buttonLabel: 'Guardar aqui',
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled ? null : result.filePaths[0] ?? null
  })

  ipcMain.handle('studio:build-pack', (_event, request: BuildRequest) => {
    return buildPack(request, reportProgress)
  })

  ipcMain.handle('studio:publish-pack', (_event, request: PublishRequest) => {
    return publishPack(request, reportProgress)
  })

  ipcMain.handle('studio:open-path', async (_event, target: string) => {
    if (/^https?:\/\//i.test(target)) {
      await shell.openExternal(target)
      return { ok: true }
    }
    const error = await shell.openPath(target)
    return error ? { ok: false, message: error } : { ok: true }
  })
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#101312',
    webPreferences: {
      preload: path.join(currentDirectory, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.once('ready-to-show', () => window.show())
  if (process.env.VITE_DEV_SERVER_URL) void window.loadURL(process.env.VITE_DEV_SERVER_URL)
  else void window.loadFile(path.join(rendererDirectory, 'index.html'))
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
