import { useEffect, useMemo, useState } from 'react'
import type {
  BuildProgress,
  PackMetadata,
  PublishResult,
  SourceScan,
  StudioResult,
} from './types'
import './App.css'

const INITIAL_METADATA: PackMetadata = {
  id: 'empilauncher-forge-1.20.1',
  name: 'EmpiLauncher Forge 1.20.1',
  version: '1.2.0',
  minecraftVersion: '1.20.1',
  loader: 'Forge',
  loaderVersion: '47.4.10',
}

function formatBytes(bytes: number) {
  if (bytes < 1_024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`
}

function App() {
  const [source, setSource] = useState<SourceScan | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [outputRoot, setOutputRoot] = useState('')
  const [metadata, setMetadata] = useState(INITIAL_METADATA)
  const [repository, setRepository] = useState('Empity001/EmpiPacks')
  const [progress, setProgress] = useState<BuildProgress | null>(null)
  const [result, setResult] = useState<StudioResult | null>(null)
  const [building, setBuilding] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => window.studio.onBuildProgress(setProgress), [])

  const selectedStats = useMemo(() => {
    const entries = source?.entries.filter((entry) => selected.has(entry.name)) ?? []
    return {
      files: entries.reduce((total, entry) => total + entry.fileCount, 0),
      size: entries.reduce((total, entry) => total + entry.size, 0),
    }
  }, [selected, source])

  const chooseSource = async () => {
    setError(null)
    const next = await window.studio.chooseSource()
    if (!next) return
    setSource(next)
    setSelected(new Set(next.entries.filter((entry) => entry.recommended).map((entry) => entry.name)))
    setResult(null)
    setPublishResult(null)
    setProgress(null)
  }

  const chooseOutput = async () => {
    const next = await window.studio.chooseOutput()
    if (next) setOutputRoot(next)
  }

  const updateMetadata = (field: keyof PackMetadata, value: string) => {
    setMetadata((current) => ({ ...current, [field]: value }))
  }

  const toggleEntry = (name: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const createPack = async () => {
    if (!source) {
      setError('Elige primero una instancia fuente.')
      return
    }
    if (!outputRoot) {
      setError('Elige donde guardar el paquete terminado.')
      return
    }
    setError(null)
    setResult(null)
    setPublishResult(null)
    setBuilding(true)
    setProgress({ message: 'Preparando el paquete...', percent: 0 })
    const next = await window.studio.buildPack({
      sourceRoot: source.root,
      outputRoot,
      selectedEntries: [...selected],
      metadata,
      repository,
    })
    setResult(next)
    if (!next.ok) setError(next.message)
    setBuilding(false)
  }

  const publish = async () => {
    if (!result?.ok) return
    setError(null)
    setPublishResult(null)
    setPublishing(true)
    const next = await window.studio.publishPack({
      repository,
      archivePath: result.archivePath,
      catalogPath: result.catalogPath,
      metadata,
    })
    setPublishResult(next)
    if (!next.ok) setError(next.message)
    setPublishing(false)
  }

  return (
    <main className="studio-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">EP</span><span>EmpiPack Studio</span></div>
        <span className="version-tag">Formato .empipack</span>
      </header>

      <section className="workspace">
        <aside className="settings-pane">
          <div className="section-heading">
            <div><span>Paquete</span><h1>Que vamos a guardar</h1></div>
          </div>

          <label className="field wide-field">
            <span>Nombre</span>
            <input value={metadata.name} onChange={(event) => updateMetadata('name', event.target.value)} />
          </label>
          <label className="field wide-field">
            <span>ID estable</span>
            <input value={metadata.id} onChange={(event) => updateMetadata('id', event.target.value)} />
          </label>
          <div className="field-grid">
            <label className="field"><span>Version</span><input value={metadata.version} onChange={(event) => updateMetadata('version', event.target.value)} /></label>
            <label className="field"><span>Minecraft</span><input value={metadata.minecraftVersion} onChange={(event) => updateMetadata('minecraftVersion', event.target.value)} /></label>
            <label className="field"><span>Modloader</span><input value={metadata.loader} disabled /></label>
            <label className="field"><span>Forge</span><input value={metadata.loaderVersion} onChange={(event) => updateMetadata('loaderVersion', event.target.value)} /></label>
          </div>
          <label className="field wide-field">
            <span>Repositorio</span>
            <input value={repository} onChange={(event) => setRepository(event.target.value)} />
          </label>

          <div className="path-block">
            <span>Instancia fuente</span>
            <p title={source?.root}>{source?.root ?? 'Ninguna carpeta elegida'}</p>
            <button className="secondary-button" type="button" onClick={chooseSource}>{source ? 'Cambiar instancia' : 'Elegir instancia'}</button>
          </div>
          <div className="path-block">
            <span>Carpeta de salida</span>
            <p title={outputRoot}>{outputRoot || 'Ninguna carpeta elegida'}</p>
            <button className="secondary-button" type="button" onClick={chooseOutput}>Elegir salida</button>
          </div>
        </aside>

        <div className="content-pane">
          <div className="content-toolbar">
            <div>
              <h2>Contenido mantenido</h2>
              <p>{selectedStats.files} archivos, {formatBytes(selectedStats.size)}</p>
            </div>
            <div className="toolbar-actions">
              <button type="button" onClick={() => setSelected(new Set(source?.entries.filter((entry) => entry.recommended).map((entry) => entry.name) ?? []))}>Recomendados</button>
              <button type="button" onClick={() => setSelected(new Set(source?.entries.map((entry) => entry.name) ?? []))}>Todo</button>
              <button type="button" onClick={() => setSelected(new Set())}>Nada</button>
            </div>
          </div>

          <div className="entry-list" aria-label="Archivos y carpetas disponibles">
            {!source && <div className="empty-state"><strong>Elige una instancia para ver su contenido.</strong></div>}
            {source?.entries.map((entry) => (
              <label className="entry-row" key={entry.name}>
                <input type="checkbox" checked={selected.has(entry.name)} onChange={() => toggleEntry(entry.name)} />
                <span className={`entry-icon ${entry.kind}`}>{entry.kind === 'folder' ? 'DIR' : 'FILE'}</span>
                <span className="entry-name"><strong>{entry.name}</strong><small>{entry.recommended ? 'Recomendado para el modpack' : 'Opcional'}</small></span>
                <span className="entry-count">{entry.fileCount} {entry.fileCount === 1 ? 'archivo' : 'archivos'}</span>
                <span className="entry-size">{formatBytes(entry.size)}</span>
              </label>
            ))}
          </div>

          <div className="build-area">
            {progress && (
              <div className="build-progress" role="status">
                <div><strong>{progress.message}</strong><span>{progress.percent}%</span></div>
                <div className="progress-track"><span style={{ width: `${progress.percent}%` }} /></div>
                <small title={progress.currentFile}>{progress.currentFile ?? 'Preparando archivos...'}</small>
              </div>
            )}
            {error && <p className="error" role="alert">{error}</p>}
            {result?.ok && (
              <div className="result-row">
                <div><strong>Paquete listo</strong><span title={result.archivePath}>{result.archivePath}</span></div>
                <div className="result-actions">
                  <button className="secondary-button" type="button" onClick={() => window.studio.openPath(outputRoot)}>Abrir carpeta</button>
                  <button className="secondary-button publish-button" type="button" disabled={publishing} onClick={publish}>{publishing ? 'Publicando...' : 'Publicar en GitHub'}</button>
                </div>
              </div>
            )}
            {publishResult?.ok && (
              <button className="release-link" type="button" onClick={() => window.studio.openPath(publishResult.releaseUrl)}>Publicado, ver release</button>
            )}
            <button className="primary-button" type="button" disabled={building} onClick={createPack}>
              {building ? 'Comprimiendo...' : 'Crear .empipack'}
            </button>
          </div>
        </div>
      </section>

      <footer className="statusbar"><span>EmpiPacks</span><span>v0.1.0</span></footer>
    </main>
  )
}

export default App
