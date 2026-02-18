/**
 * Diff Runner — orchestrates two snapshots and returns a DiffResult.
 */

import { snapshotRef } from './snapshot.js'
import { computeDiff } from './diff-classifier.js'

/**
 * Parse "before..after" into its two parts.
 *
 * @param {string} range
 * @returns {{ beforeRef: string, afterRef: string }}
 */
export function parseRefRange(range) {
  const idx = range.indexOf('..')
  if (idx === -1) throw new Error(`Invalid ref range "${range}" — expected "before..after"`)
  return {
    beforeRef: range.slice(0, idx),
    afterRef:  range.slice(idx + 2) || 'HEAD',
  }
}

/**
 * Run a full diff between two git refs.
 *
 * @param {string} rootDir
 * @param {string} range           "before..after"
 * @param {{ verbose?: boolean }} options
 * @returns {Promise<import('./diff-classifier.js').DiffResult>}
 */
export async function runDiff(rootDir, range, options = {}) {
  const { verbose = false } = options
  const { beforeRef, afterRef } = parseRefRange(range)

  if (verbose) process.stderr.write(`\nSnapshotting ${beforeRef} and ${afterRef} in parallel...\n`)

  const [beforeMap, afterMap] = await Promise.all([
    snapshotRef(rootDir, beforeRef, options),
    snapshotRef(rootDir, afterRef, options),
  ])

  if (verbose) {
    process.stderr.write(`  Before: ${beforeMap.size} functions\n`)
    process.stderr.write(`  After:  ${afterMap.size} functions\n`)
  }

  return computeDiff(beforeMap, afterMap, beforeRef, afterRef)
}
