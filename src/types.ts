export interface SourceEntry {
  name: string
  kind: 'folder' | 'file'
  size: number
  fileCount: number
  recommended: boolean
}

export interface SourceScan {
  root: string
  entries: SourceEntry[]
}

export interface PackMetadata {
  id: string
  name: string
  version: string
  minecraftVersion: string
  loader: 'Forge'
  loaderVersion: string
}

export interface BuildRequest {
  sourceRoot: string
  outputRoot: string
  selectedEntries: string[]
  metadata: PackMetadata
  repository: string
}

export interface BuildProgress {
  message: string
  percent: number
  currentFile?: string
}

export interface PublishRequest {
  repository: string
  archivePath: string
  catalogPath: string
  metadata: PackMetadata
}

export type StudioResult =
  | { ok: true; archivePath: string; catalogPath: string; sha256: string; size: number }
  | { ok: false; message: string }

export type PublishResult =
  | { ok: true; releaseUrl: string }
  | { ok: false; message: string }

export interface StudioBridge {
  chooseSource(): Promise<SourceScan | null>
  chooseOutput(): Promise<string | null>
  buildPack(request: BuildRequest): Promise<StudioResult>
  publishPack(request: PublishRequest): Promise<PublishResult>
  openPath(target: string): Promise<{ ok: true } | { ok: false; message: string }>
  onBuildProgress(listener: (progress: BuildProgress) => void): () => void
}
