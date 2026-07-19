import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type {
  BuildProgress,
  PublishRequest,
  PublishResult,
} from '../src/types.js'

const execFileAsync = promisify(execFile)

interface CatalogPack {
  id: string
  version: string
  [key: string]: unknown
}

interface Catalog {
  schemaVersion: 1
  packs: CatalogPack[]
}

interface GitHubFile {
  content: string
  sha: string
}

async function runGh(args: string[]) {
  return await execFileAsync('gh', args, {
    windowsHide: true,
    maxBuffer: 10 * 1_024 * 1_024,
  })
}

function commandMessage(error: unknown) {
  if (!(error instanceof Error)) return 'GitHub CLI no pudo completar la publicacion.'
  if ('code' in error && error.code === 'ENOENT') {
    return 'Falta GitHub CLI. Instalalo y ejecuta gh auth login antes de publicar.'
  }
  if ('stderr' in error && typeof error.stderr === 'string' && error.stderr.trim()) {
    return error.stderr.trim()
  }
  return error.message
}

async function readRemoteCatalog(repository: string) {
  try {
    const { stdout } = await runGh(['api', `repos/${repository}/contents/catalog.json`])
    const file = JSON.parse(stdout) as GitHubFile
    const catalog = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')) as Catalog
    return { catalog, sha: file.sha }
  } catch (error) {
    const message = commandMessage(error)
    if (/404|not found/i.test(message)) {
      return { catalog: { schemaVersion: 1, packs: [] } satisfies Catalog, sha: null }
    }
    throw error
  }
}

export async function publishPack(
  request: PublishRequest,
  report: (progress: BuildProgress) => void,
): Promise<PublishResult> {
  try {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(request.repository)) {
      throw new Error('El repositorio debe tener el formato usuario/nombre.')
    }
    await runGh(['auth', 'status'])
    const generated = JSON.parse(await readFile(request.catalogPath, 'utf8')) as Catalog
    const nextPack = generated.packs[0]
    if (!nextPack || nextPack.id !== request.metadata.id) {
      throw new Error('El catalogo generado no coincide con el paquete.')
    }

    const tag = `${request.metadata.id}-${request.metadata.version}`
    report({ message: 'Subiendo el paquete a GitHub...', percent: 25, currentFile: path.basename(request.archivePath) })
    try {
      await runGh(['release', 'view', tag, '--repo', request.repository])
      await runGh([
        'release', 'upload', tag, request.archivePath,
        '--repo', request.repository,
        '--clobber',
      ])
    } catch {
      await runGh([
        'release', 'create', tag, request.archivePath,
        '--repo', request.repository,
        '--title', `${request.metadata.name} v${request.metadata.version}`,
        '--notes', `Paquete ${request.metadata.version} generado con EmpiPack Studio.`,
      ])
    }

    report({ message: 'Actualizando el catalogo remoto...', percent: 75, currentFile: 'catalog.json' })
    const remote = await readRemoteCatalog(request.repository)
    const catalog: Catalog = {
      schemaVersion: 1,
      packs: [
        ...remote.catalog.packs.filter((pack) => pack.id !== nextPack.id),
        nextPack,
      ].sort((left, right) => left.id.localeCompare(right.id)),
    }
    const args = [
      'api', '--method', 'PUT', `repos/${request.repository}/contents/catalog.json`,
      '-f', `message=publish: ${request.metadata.id} ${request.metadata.version}`,
      '-f', `content=${Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`).toString('base64')}`,
    ]
    if (remote.sha) args.push('-f', `sha=${remote.sha}`)
    await runGh(args)
    report({ message: 'Paquete publicado.', percent: 100, currentFile: tag })
    return {
      ok: true,
      releaseUrl: `https://github.com/${request.repository}/releases/tag/${tag}`,
    }
  } catch (error) {
    return { ok: false, message: commandMessage(error) }
  }
}
