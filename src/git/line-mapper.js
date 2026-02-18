/**
 * Line mapper — resolves changed file/line ranges to function IDs.
 *
 * A function is "touched" by a commit if any changed hunk overlaps
 * with [fn.line, fn.endLine] in its source file.
 *
 * Handles the rootDir != gitRoot case by doing suffix matching when
 * exact path resolution fails.
 */

import { relative, resolve, join } from 'path'

/**
 * Build an index of functions keyed by every plausible path form.
 * This is built once and reused across all commits.
 *
 * @param {import('../graph/call-graph.js').CallGraph} graph
 * @param {string} gitRoot   Absolute path to the git root
 * @param {string} rootDir   Absolute path to the analysed project root
 * @returns {Map<string, FunctionNode[]>}  path variants → functions in that file
 */
export function buildFileIndex(graph, gitRoot, rootDir) {
  const index = new Map()

  for (const node of graph.getAllNodes()) {
    // node.file is absolute; store under multiple path forms so we can
    // match whatever git gives us (relative to gitRoot, or relative to rootDir)
    const keys = [
      node.file,                               // absolute
      node.relPath,                            // relative to rootDir
      relative(gitRoot, node.file),            // relative to gitRoot
    ]

    for (const key of keys) {
      if (!key) continue
      if (!index.has(key)) index.set(key, [])
      index.get(key).push(node)
    }
  }

  return index
}

/**
 * Given a file path from a git diff and an array of changed hunks,
 * return the set of function IDs that were touched.
 *
 * @param {string} diffFile       Path as reported by git (relative to gitRoot)
 * @param {{start:number,end:number}[]} ranges  Changed line ranges (new-file coords)
 * @param {Map<string, FunctionNode[]>} fileIndex
 * @param {string} gitRoot
 * @param {string} rootDir
 * @returns {Set<string>}  touched function IDs
 */
export function mapToFunctions(diffFile, ranges, fileIndex, gitRoot, rootDir) {
  const touched = new Set()

  // Try progressively looser path matches
  const candidates =
    fileIndex.get(diffFile) ??
    fileIndex.get(resolve(gitRoot, diffFile)) ??
    fileIndex.get(relative(rootDir, resolve(gitRoot, diffFile))) ??
    suffixMatch(diffFile, fileIndex)

  if (!candidates) return touched

  for (const fn of candidates) {
    for (const { start, end } of ranges) {
      // Overlap check: [fn.line, fn.endLine] ∩ [start, end] ≠ ∅
      if (start <= fn.endLine && end >= fn.line) {
        touched.add(fn.id)
        break
      }
    }
  }

  return touched
}

/**
 * Last-resort: find functions whose file path ends with diffFile.
 * Handles cases like gitRoot="/" and rootDir="/project/src" where
 * the diff shows "src/api/foo.ts" but relPath is "api/foo.ts".
 */
function suffixMatch(diffFile, fileIndex) {
  for (const [key, fns] of fileIndex) {
    if (key.endsWith(diffFile) || diffFile.endsWith(key)) return fns
  }
  return null
}

/**
 * @typedef {import('../graph/call-graph.js').FunctionNode} FunctionNode
 */
