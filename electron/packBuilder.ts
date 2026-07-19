import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { lstat, mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { ZipFile } from 'yazl'
import type {
  BuildProgress,
  BuildRequest,
  SourceEntry,
  SourceScan,
  StudioResult,
} from '../src/types.js'

const RECOMMENDED = new Set([
  'config',
  'defaultconfigs',
  'kubejs',
  'mods',
  'resourcepacks',
  'scripts',
  'shaderpacks',
])
const RECOMMENDED_FILES = new Set(['options.txt', 'servers.dat'])
const ALREADY_COMPRESSED = /\.(?:7z|bz2|gif|gz|jar|jpe?g|mp3|mp4|ogg|png|rar|webp|zip)$/i

interface FileToPack {
  absolutePath: string
  relativePath: string
  size: number
}

async function measure(target: string): Promise<{ size: number; fileCount: number }> {
  const info = await lstat(target)
  if (info.isSymbolicLink()) return { size: 0, fileCount: 0 }
  if (info.isFile()) return { size: info.size, fileCount: 1 }
  if (!info.isDirectory()) return { size: 0, fileCount: 0 }
  let size = 0
  let fileCount = 0
  for (const entry of await readdir(target)) {
    const measured = await measure(path.join(target, entry))
    size += measured.size
    fileCount += measured.fileCount
  }
  return { size, fileCount }
}

export async function scanSource(root: string): Promise<SourceScan> {
  const entries: SourceEntry[] = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() && !entry.isFile()) continue
    const measured = await measure(path.join(root, entry.name))
    entries.push({
      name: entry.name,
      kind: entry.isDirectory() ? 'folder' : 'file',
      size: measured.size,
      fileCount: measured.fileCount,
      recommended: entry.isDirectory()
        ? RECOMMENDED.has(entry.name.toLowerCase())
        : RECOMMENDED_FILES.has(entry.name.toLowerCase()),
    })
  }
  entries.sort((left, right) => {
    if (left.recommended !== right.recommended) return left.recommended ? -1 : 1
    if (left.kind !== right.kind) return left.kind === 'folder' ? -1 : 1
    return left.name.localeCompare(right.name)
  })
  return { root, entries }
}

function validateRequest(request: BuildRequest) {
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(request.metadata.id)) {
    throw new Error('El ID debe usar minusculas, numeros, puntos o guiones.')
  }
  if (!/^\d+\.\d+\.\d+$/.test(request.metadata.version)) {
    throw new Error('La version del paquete debe tener el formato 1.0.0.')
  }
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(request.metadata.minecraftVersion)) {
    throw new Error('La version de Minecraft no parece valida.')
  }
  if (!request.selectedEntries.length) throw new Error('Selecciona al menos una carpeta o archivo.')
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(request.repository)) {
    throw new Error('El repositorio debe tener el formato usuario/nombre.')
  }
  for (const entry of request.selectedEntries) {
    if (entry.includes('/') || entry.includes('\\') || entry === '..') {
      throw new Error(`Entrada no valida: ${entry}`)
    }
  }
}

async function collectFiles(root: string, selectedEntries: string[]) {
  const files: FileToPack[] = []
  const visit = async (absolutePath: string, relativePath: string) => {
    const info = await lstat(absolutePath)
    if (info.isSymbolicLink()) return
    if (info.isFile()) {
      files.push({ absolutePath, relativePath, size: info.size })
      return
    }
    if (!info.isDirectory()) return
    for (const entry of await readdir(absolutePath)) {
      await visit(path.join(absolutePath, entry), path.posix.join(relativePath, entry))
    }
  }
  for (const entry of selectedEntries) await visit(path.join(root, entry), entry)
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

async function digest(filePath: string) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

export async function buildPack(
  request: BuildRequest,
  report: (progress: BuildProgress) => void,
): Promise<StudioResult> {
  try {
    validateRequest(request)
    const sourceInfo = await stat(request.sourceRoot)
    if (!sourceInfo.isDirectory()) throw new Error('La carpeta fuente ya no existe.')
    await mkdir(request.outputRoot, { recursive: true })
    report({ message: 'Revisando archivos seleccionados...', percent: 2 })
    const files = await collectFiles(request.sourceRoot, request.selectedEntries)
    if (!files.length) throw new Error('La seleccion no contiene archivos.')

    const filename = `${request.metadata.id}-${request.metadata.version}.empipack`
    const archivePath = path.join(request.outputRoot, filename)
    const zip = new ZipFile()
    const output = createWriteStream(archivePath)
    zip.addBuffer(
      Buffer.from(`${JSON.stringify(request.metadata, null, 2)}\n`),
      'pack.json',
    )
    files.forEach((file, index) => {
      zip.addFile(file.absolutePath, `overrides/${file.relativePath}`, {
        compress: !ALREADY_COMPRESSED.test(file.relativePath),
      })
      report({
        message: 'Comprimiendo el modpack...',
        percent: 5 + Math.round(((index + 1) / files.length) * 88),
        currentFile: file.relativePath,
      })
    })
    zip.end()
    await pipeline(zip.outputStream, output)

    const [sha256, archiveStat] = await Promise.all([digest(archivePath), stat(archivePath)])
    const releaseTag = `${request.metadata.id}-${request.metadata.version}`
    const catalog = {
      schemaVersion: 1,
      packs: [{
        ...request.metadata,
        archiveUrl: `https://github.com/${request.repository}/releases/download/${releaseTag}/${filename}`,
        sha256,
        size: archiveStat.size,
      }],
    }
    const catalogPath = path.join(request.outputRoot, 'catalog.json')
    await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
    await writeFile(
      path.join(request.outputRoot, `${request.metadata.id}-${request.metadata.version}.catalog-entry.json`),
      `${JSON.stringify(catalog.packs[0], null, 2)}\n`,
      'utf8',
    )
    report({ message: 'Paquete y catalogo listos.', percent: 100, currentFile: filename })
    return { ok: true, archivePath, catalogPath, sha256, size: archiveStat.size }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'No se pudo crear el paquete.',
    }
  }
}
