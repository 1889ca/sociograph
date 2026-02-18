/**
 * Git analyzer — orchestrates commit fetching and produces GitMetrics
 * for every function in the graph.
 *
 * GitMetrics per function:
 *   commits      — total commits that touched this function
 *   fixCommits   — how many of those were bugfixes
 *   authors      — Set of unique author emails
 *   firstSeen    — date of earliest touching commit
 *   lastSeen     — date of most recent touching commit
 *   coCommits    — Map<otherFunctionId, count> of co-change frequency
 *
 * Co-commit pairs with count >= 3 and correlation >= 0.5 surface as
 * Codependents. Functions with fixRatio >= 0.4 and commits >= 5
 * surface as Crisis Points.
 */

import { fetchCommits } from './git-log.js'
import { buildFileIndex, mapToFunctions } from './line-mapper.js'

/**
 * @param {string} rootDir
 * @param {import('../graph/call-graph.js').CallGraph} graph
 * @param {{ limit?: number, verbose?: boolean }} options
 * @returns {Promise<Map<string, GitMetrics> | null>}
 */
export async function analyzeGit(rootDir, graph, options = {}) {
  const { verbose = false } = options

  const result = await fetchCommits(rootDir, { ...options, verbose })
  if (!result) return null

  const { commits, gitRoot } = result
  if (commits.length === 0) return null

  const fileIndex = buildFileIndex(graph, gitRoot, rootDir)

  // Initialise metrics for every known function
  const metrics = new Map()
  for (const node of graph.getAllNodes()) {
    metrics.set(node.id, emptyMetrics())
  }

  let processed = 0
  for (const commit of commits) {
    // Collect all functions touched in this commit
    const touched = new Set()

    for (const { file, ranges } of commit.changes) {
      const fns = mapToFunctions(file, ranges, fileIndex, gitRoot, rootDir)
      for (const id of fns) touched.add(id)
    }

    // Update metrics for each touched function
    for (const id of touched) {
      const m = metrics.get(id)
      if (!m) continue

      m.commits++
      if (commit.isFix) m.fixCommits++
      m.authors.add(commit.author)
      if (!m.firstSeen || commit.date < m.firstSeen) m.firstSeen = commit.date
      if (!m.lastSeen  || commit.date > m.lastSeen)  m.lastSeen  = commit.date

      // Co-commit: record every other function changed in this commit
      // Cap per-function co-commit tracking to avoid O(N²) blowup on
      // commits that touch hundreds of functions (e.g. large refactors)
      if (touched.size <= 50) {
        for (const otherId of touched) {
          if (otherId === id) continue
          m.coCommits.set(otherId, (m.coCommits.get(otherId) ?? 0) + 1)
        }
      }
    }

    processed++
  }

  if (verbose) {
    const withData = [...metrics.values()].filter(m => m.commits > 0).length
    process.stderr.write(`  Mapped ${processed} commits → ${withData} functions with history\n`)
  }

  return metrics
}

/**
 * For a pair (A, B), compute the co-commit correlation:
 *   coCommits(A,B) / min(commits(A), commits(B))
 *
 * = "what fraction of A's lifetime did it change alongside B?"
 */
export function coCommitCorrelation(metricsA, metricsB, idB) {
  const coCount = metricsA.coCommits.get(idB) ?? 0
  const minCommits = Math.min(metricsA.commits, metricsB.commits)
  if (minCommits === 0) return 0
  return coCount / minCommits
}

/**
 * Find the strongest co-commit partner for a function.
 * Returns { partnerId, correlation, coCount } or null.
 */
export function strongestPartner(nodeId, metrics, minCoCount = 3) {
  const m = metrics.get(nodeId)
  if (!m || m.coCommits.size === 0) return null

  let best = null
  let bestCorr = 0

  for (const [otherId, coCount] of m.coCommits) {
    // Must co-change enough times to be meaningful (not just one big commit)
    if (coCount < minCoCount) continue
    const otherMetrics = metrics.get(otherId)
    if (!otherMetrics) continue
    const corr = coCommitCorrelation(m, otherMetrics, otherId)
    if (corr > bestCorr) {
      bestCorr = corr
      best = { partnerId: otherId, correlation: corr, coCount }
    }
  }

  return best
}

function emptyMetrics() {
  return {
    commits:    0,
    fixCommits: 0,
    authors:    new Set(),
    firstSeen:  null,
    lastSeen:   null,
    coCommits:  new Map(),
  }
}

/**
 * @typedef {Object} GitMetrics
 * @property {number}  commits
 * @property {number}  fixCommits
 * @property {Set<string>} authors
 * @property {Date|null}   firstSeen
 * @property {Date|null}   lastSeen
 * @property {Map<string,number>} coCommits
 */
