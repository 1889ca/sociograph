/**
 * Cluster Detector — finds communities of tightly coupled functions
 * using label propagation on the undirected resolved call graph.
 *
 * Label propagation: each node iteratively adopts the most common label
 * among its neighbors. Converges in ~5–10 passes. Ties broken
 * lexicographically so output is deterministic.
 *
 * Returns clusters sorted by interest: cross-module first, then by size.
 * Singletons and pairs are omitted (minSize = 3 by default).
 */

/**
 * @typedef {Object} Cluster
 * @property {number}   size
 * @property {string[]} nodeIds
 * @property {string[]} modules        — distinct modules spanned
 * @property {boolean}  isMultiModule
 * @property {number}   density        — internal edges / max possible (0–1)
 * @property {string[]} hubs           — top 3 nodeIds by internal degree
 */

/**
 * @param {import('./call-graph.js').CallGraph} graph
 * @param {{ minSize?: number }} options
 * @returns {Cluster[]}
 */
export function detectClusters(graph, { minSize = 3 } = {}) {
  // Build undirected adjacency from resolved edges
  const neighbors = new Map()
  for (const node of graph.getAllNodes()) neighbors.set(node.id, new Set())

  for (const edge of graph.edges) {
    if (!edge.resolved || !edge.to) continue
    neighbors.get(edge.from)?.add(edge.to)
    neighbors.get(edge.to)?.add(edge.from)
  }

  const labels = labelPropagate([...neighbors.keys()], neighbors)

  // Group nodes by label
  const groups = new Map()
  for (const [id, label] of labels) {
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label).push(id)
  }

  const clusters = []

  for (const nodeIds of groups.values()) {
    if (nodeIds.length < minSize) continue

    const nodeSet = new Set(nodeIds)
    const modules = [...new Set(
      nodeIds.map(id => graph.getNode(id)?.module).filter(Boolean)
    )]

    // Per-node internal degree, total internal edge count
    const inDegree = new Map()
    let edgeCount = 0
    for (const id of nodeIds) {
      let deg = 0
      for (const nbr of (neighbors.get(id) ?? [])) {
        if (nodeSet.has(nbr)) deg++
      }
      inDegree.set(id, deg)
      edgeCount += deg
    }
    edgeCount /= 2 // undirected: each edge counted twice

    const maxEdges = (nodeIds.length * (nodeIds.length - 1)) / 2
    const density  = maxEdges > 0 ? edgeCount / maxEdges : 0

    const hubs = [...inDegree.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => id)

    clusters.push({ size: nodeIds.length, nodeIds, modules, isMultiModule: modules.length > 1, density, hubs })
  }

  return clusters.sort((a, b) => {
    if (a.isMultiModule !== b.isMultiModule) return a.isMultiModule ? -1 : 1
    return b.size - a.size
  })
}

function labelPropagate(nodeIds, neighbors) {
  const labels = new Map(nodeIds.map(id => [id, id]))

  for (let iter = 0; iter < 15; iter++) {
    let changed = false

    for (const id of nodeIds) {
      const nbrs = neighbors.get(id)
      if (!nbrs || nbrs.size === 0) continue

      // Frequency count of neighbor labels
      const freq = new Map()
      for (const nbr of nbrs) {
        const lbl = labels.get(nbr)
        freq.set(lbl, (freq.get(lbl) ?? 0) + 1)
      }

      // Most frequent label; lexicographic min breaks ties (deterministic)
      let best = null, bestCount = 0
      for (const [lbl, count] of freq) {
        if (count > bestCount || (count === bestCount && (best === null || lbl < best))) {
          best = lbl; bestCount = count
        }
      }

      if (best !== labels.get(id)) { labels.set(id, best); changed = true }
    }

    if (!changed) break
  }

  return labels
}
