/**
 * Bridge Detector — finds functions that exclusively (or primarily) connect
 * two module clusters that would otherwise be disconnected.
 *
 * A "bridge" node has callers from module A and callees in module B, and is
 * the sole or dominant path from A to B. These are fragile linchpins: quiet,
 * load-bearing, and easy to miss until they break.
 *
 * Algorithm (three passes, all O(V × D) where D = max distinct modules/node):
 *
 * Pass 1: for each node, collect its external caller-module set and
 *         callee-module set (excluding the node's own module).
 *
 * Pass 2: build bridgers[(A,B)] = Set of all nodes that have at least one
 *         caller from A and at least one callee in B.
 *
 * Pass 3: for each node, score = max over bridged pairs of (1 / |bridgers|).
 *         Score ≥ 0.5 means the node accounts for ≥50% of A→B connectivity.
 */

/**
 * @typedef {Object} BridgeInfo
 * @property {number} score  — max exclusivity across all bridged pairs (0–1; 1 = sole bridge)
 * @property {{ from: string, to: string, exclusivity: number, total: number }[]} pairs
 */

/**
 * @param {import('./call-graph.js').CallGraph} graph
 * @returns {Map<string, BridgeInfo>}
 */
export function computeBridgeScores(graph) {
  // Pass 1 — module sets per node
  const nodeModuleSets = new Map()

  for (const node of graph.getAllNodes()) {
    const callerMods = new Set()
    const calleeMods = new Set()

    for (const edge of graph.callers(node.id)) {
      if (!edge.resolved) continue
      const m = graph.getNode(edge.from)?.module
      if (m && m !== node.module) callerMods.add(m)
    }

    for (const edge of graph.callees(node.id)) {
      if (!edge.resolved) continue
      const m = graph.getNode(edge.to)?.module
      if (m && m !== node.module) calleeMods.add(m)
    }

    nodeModuleSets.set(node.id, { callerMods, calleeMods })
  }

  // Pass 2 — bridgers map
  const bridgers = new Map() // "A::B" -> Set<nodeId>

  for (const [nodeId, { callerMods, calleeMods }] of nodeModuleSets) {
    for (const A of callerMods) {
      for (const B of calleeMods) {
        if (A === B) continue
        const key = `${A}::${B}`
        if (!bridgers.has(key)) bridgers.set(key, new Set())
        bridgers.get(key).add(nodeId)
      }
    }
  }

  // Pass 3 — score each node
  const results = new Map()

  for (const [nodeId, { callerMods, calleeMods }] of nodeModuleSets) {
    if (callerMods.size === 0 || calleeMods.size === 0) continue

    let maxScore = 0
    const pairs = []

    for (const A of callerMods) {
      for (const B of calleeMods) {
        if (A === B) continue
        const key = `${A}::${B}`
        const total = bridgers.get(key)?.size ?? 1
        const exclusivity = 1 / total
        if (exclusivity > maxScore) maxScore = exclusivity
        if (exclusivity >= 0.5) pairs.push({ from: A, to: B, exclusivity, total })
      }
    }

    if (maxScore >= 0.5) {
      results.set(nodeId, {
        score: maxScore,
        pairs: pairs.sort((a, b) => b.exclusivity - a.exclusivity),
      })
    }
  }

  return results
}
