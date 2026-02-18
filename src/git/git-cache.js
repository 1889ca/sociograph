/**
 * Git commit cache — persists parsed commit history to avoid re-running
 * `git log -p` on every invocation.
 *
 * Cache file: <gitRoot>/.sociograph/commits-cache.json
 * Invalidated when HEAD changes or --git-limit changes.
 *
 * Commits are plain JSON-serializable (Dates stored as ISO strings).
 * GitMetrics (with Set/Map fields) are NOT cached — they're fast to
 * recompute from the cached commits.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { execFile } from 'child_process'
import { join } from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const CACHE_VERSION = 1
const CACHE_FILE    = '.sociograph/commits-cache.json'

/**
 * @param {string} gitRoot
 * @returns {Promise<string|null>}
 */
export async function getHeadHash(gitRoot) {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: gitRoot })
    return stdout.trim()
  } catch {
    return null
  }
}

/**
 * Read cached commits if they're fresh (version, limit, and HEAD all match).
 *
 * @param {string} gitRoot
 * @param {number} limit
 * @param {string} headHash
 * @returns {import('./git-log.js').Commit[] | null}
 */
export function readCache(gitRoot, limit, headHash) {
  const cacheFile = join(gitRoot, CACHE_FILE)
  if (!existsSync(cacheFile)) return null

  let data
  try {
    data = JSON.parse(readFileSync(cacheFile, 'utf8'))
  } catch {
    return null
  }

  if (data.version !== CACHE_VERSION) return null
  if (data.limit   !== limit)         return null
  if (data.headHash !== headHash)      return null

  // Revive Date objects — JSON round-trips them as ISO strings
  return data.commits.map(c => ({ ...c, date: new Date(c.date) }))
}

/**
 * Write commits to cache (best-effort — silently ignores errors).
 *
 * @param {string} gitRoot
 * @param {number} limit
 * @param {string} headHash
 * @param {import('./git-log.js').Commit[]} commits
 */
export function writeCache(gitRoot, limit, headHash, commits) {
  try {
    const dir = join(gitRoot, '.sociograph')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(gitRoot, CACHE_FILE),
      JSON.stringify({ version: CACHE_VERSION, limit, headHash, commits }),
      'utf8',
    )
  } catch { /* best effort */ }
}
