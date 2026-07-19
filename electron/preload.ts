import { contextBridge, ipcRenderer } from 'electron'
import type { BuildProgress, BuildRequest, PublishRequest, StudioBridge } from '../src/types.js'

const bridge: StudioBridge = {
  chooseSource: () => ipcRenderer.invoke('studio:choose-source'),
  chooseOutput: () => ipcRenderer.invoke('studio:choose-output'),
  buildPack: (request: BuildRequest) => ipcRenderer.invoke('studio:build-pack', request),
  publishPack: (request: PublishRequest) => ipcRenderer.invoke('studio:publish-pack', request),
  openPath: (target: string) => ipcRenderer.invoke('studio:open-path', target),
  onBuildProgress: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: BuildProgress) => listener(progress)
    ipcRenderer.on('studio:build-progress', handler)
    return () => ipcRenderer.removeListener('studio:build-progress', handler)
  },
}

contextBridge.exposeInMainWorld('studio', bridge)
