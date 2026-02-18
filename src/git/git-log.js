/**
 * Git log reader — fetches commit history with changed line ranges in one shot.
 *
 * Uses a single `git log -p` call rather than N+1 subprocess calls.
 * Parses the output into structured commits with per-file hunk ranges.
 *
 * Returns: { commits, gitRoot } or null if no git repo found.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { join } from 'path'

const exec = promisify(execFile)

const FIX_PATTERNS = [
  /\bfix(es|ed|ing)?\b/i,
  /\bbug\b/i,
  /\bhotfix\b/i,
  /\bpatch\b/i,
  /\brevert\b/i,
  /\bregression\b/i,
  /\bcrash\b/i,
  /\bbroken?\b/i,
]

const JS_EXTENSIONS = '*.js *.ts *.jsx *.tsx *.mjs *.cjs'.split(' ')

/**
 * Find the git root for a given directory.
 * Returns null if not inside a git repository.
 */
export async function findGitRoot(dir) {
  try {
    const { stdout } = await exec('git', ['rev-parse', '--show-toplevel'], { cwd: dir })
    return stdout.trim()
  } catch {
    return null
  }
}

/**
 * Fetch and parse git history for a directory.
 *
 * @param {string} rootDir     Project root (used as git cwd)
 * @param {{ limit?: number, verbose?: boolean }} options
 * @returns {Promise<{ commits: Commit[], gitRoot: string } | null>}
 */
export async function fetchCommits(rootDir, options = {}) {
  const { limit = 500, verbose = false } = options

  const gitRoot = await findGitRoot(rootDir)
  if (!gitRoot) return null

  if (verbose) process.stderr.write(`  Reading git history (last ${limit} commits)...\n`)

  const args = [
    'log',
    `--format=COMMIT:%H|%ae|%ai|%s`,
    '--unified=0',
    '--diff-filter=M',
    '--no-color',
    `--max-count=${limit}`,
    '--',
    ...JS_EXTENSIONS,
  ]

  let stdout
  try {
    const result = await exec('git', args, {
      cwd: rootDir,
      maxBuffer: 100 * 1024 * 1024,  // 100MB
    })
    stdout = result.stdout
  } catch {
    return null
  }

  const commits = parse(stdout)
  if (verbose) process.stderr.write(`  Parsed ${commits.length} commits\n`)

  return { commits, gitRoot }
}

/**
 * Parse `git log -p` output into structured commits.
 *
 * @param {string} output
 * @returns {Commit[]}
 */
function parse(output) {
  const commits = []
  let current = null
  let currentFile = null

  for (const line of output.split('\n')) {
    if (line.startsWith('COMMIT:')) {
      if (current) commits.push(current)
      const rest = line.slice(7)
      const pipeIdx = rest.indexOf('|')
      const rest2 = rest.slice(pipeIdx + 1)
      const pipeIdx2 = rest2.indexOf('|')
      const rest3 = rest2.slice(pipeIdx2 + 1)
      const pipeIdx3 = rest3.indexOf('|')

      current = {
        hash:    rest.slice(0, pipeIdx),
        author:  rest2.slice(0, pipeIdx2),
        date:    new Date(rest3.slice(0, pipeIdx3)),
        message: rest3.slice(pipeIdx3 + 1),
        isFix:   FIX_PATTERNS.some(p => p.test(rest3.slice(pipeIdx3 + 1))),
        changes: [],   // [{ file: string, ranges: [{start,end}] }]
      }
      currentFile = null
      continue
    }

    if (!current) continue

    // "diff --git a/path/to/file.ts b/path/to/file.ts"
    if (line.startsWith('diff --git ')) {
      const match = line.match(/diff --git a\/.+ b\/(.+)/)
      currentFile = match ? match[1] : null
      continue
    }

    // "@@ -old_start[,old_count] +new_start[,new_count] @@ ..."
    if (line.startsWith('@@ ') && currentFile) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
      if (!match) continue

      const start = parseInt(match[1], 10)
      const count = parseInt(match[2] ?? '1', 10)
      // count=0 means a deletion (no new lines); still record the position
      const end = count === 0 ? start : start + count - 1

      let entry = current.changes.find(c => c.file === currentFile)
      if (!entry) {
        entry = { file: currentFile, ranges: [] }
        current.changes.push(entry)
      }
      entry.ranges.push({ start, end })
    }
  }

  if (current) commits.push(current)
  return commits
}

/**
 * @typedef {Object} Commit
 * @property {string} hash
 * @property {string} author
 * @property {Date}   date
 * @property {string} message
 * @property {boolean} isFix
 * @property {{ file: string, ranges: {start: number, end: number}[] }[]} changes
 */
