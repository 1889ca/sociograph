/**
 * Snapshot — check out a git ref via worktree, build its call graph,
 * classify it, and return a flat Map of NodeSnapshot objects.
 *
 * Uses `git worktree add --detach` so the user's working tree is untouched.
 */

import { execFile } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import { buildGraph } from '../graph/graph-builder.js'
import { classify } from '../analyzers/classifier.js'

const execFileAsync = promisify(execFile)

/**
 * @typedef {Object} NodeSnapshot
 * @property {string}   id
 * @property {string}   name
 * @property {string}   relPath
 * @property {number}   line
 * @property {string}   module
 * @property {number}   complexity
 * @property {number}   linesOfCode
 * @property {number}   params
 * @property {number}   fanIn
 * @property {number}   fanOut
 * @property {number}   crossModuleFanOut
 * @property {string[]} archetypes         label strings of matched archetypes
 */

/**
 * Snapshot all functions at a given git ref.
 *
 * @param {string} rootDir
 * @param {string} ref
 * @param {{ verbose?: boolean }} options
 * @returns {Promise<Map<string, NodeSnapshot>>}  keyed by node.id
 */
export async function snapshotRef(rootDir, ref, options = {}) {
  const { verbose = false } = options
  const worktreePath = await createWorktree(rootDir, ref, verbose)

  try {
    const graph = await buildGraph(worktreePath, { verbose })
    const classifications = classify(graph)

    const snapshot = new Map()
    for (const node of graph.getAllNodes()) {
      snapshot.set(node.id, toSnapshot(node, graph, classifications))
    }
    return snapshot
  } finally {
    await removeWorktree(rootDir, worktreePath, verbose)
  }
}

// --- Internals ---

async function createWorktree(rootDir, ref, verbose) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'sociograph-'))
  if (verbose) process.stderr.write(`  Checking out ${ref} → ${tmpDir}\n`)
  await execFileAsync('git', ['-C', rootDir, 'worktree', 'add', '--detach', tmpDir, ref])
  return tmpDir
}

async function removeWorktree(rootDir, worktreePath, verbose) {
  try {
    await execFileAsync('git', ['-C', rootDir, 'worktree', 'remove', '--force', worktreePath])
  } catch {
    // If git remove fails, still nuke the directory
  }
  try {
    rmSync(worktreePath, { recursive: true, force: true })
  } catch { /* best effort */ }
  if (verbose) process.stderr.write(`  Cleaned up worktree\n`)
}

/**
 * Extract a flat, serializable snapshot from a node + live graph.
 * Must be called before the graph is GC'd.
 */
function toSnapshot(node, graph, classifications) {
  const archetypes = (classifications.get(node.id) ?? []).map(c => c.label)
  return {
    id:               node.id,
    name:             node.name,
    relPath:          node.relPath,
    line:             node.line,
    module:           node.module,
    complexity:       node.complexity,
    linesOfCode:      node.linesOfCode,
    params:           node.params,
    fanIn:            graph.fanIn(node.id),
    fanOut:           graph.fanOut(node.id),
    crossModuleFanOut: graph.crossModuleFanOut(node.id),
    archetypes,
  }
}
