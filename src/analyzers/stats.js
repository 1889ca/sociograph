/**
 * Graph statistics — computes percentile thresholds used by the classifier.
 *
 * All thresholds are relative to the codebase being analyzed so the
 * classifier doesn't need tuning per project size.
 */

/**
 * Compute per-metric statistics across all nodes in the graph.
 * Returns an object of { metricName -> { p50, p75, p90, p95, max, mean } }
 *
 * @param {import('../graph/call-graph.js').CallGraph} graph
 */
export function computeStats(graph) {
  const nodes = graph.getAllNodes()
  if (nodes.length === 0) return {}

  const metrics = {
    fanIn:            nodes.map(n => graph.fanIn(n.id)),
    fanOut:           nodes.map(n => graph.fanOut(n.id)),
    complexity:       nodes.map(n => n.complexity),
    linesOfCode:      nodes.map(n => n.linesOfCode),
    params:           nodes.map(n => n.params),
    crossModuleFanOut: nodes.map(n => graph.crossModuleFanOut(n.id)),
    crossModuleRatio: nodes.map(n => {
      const fo = graph.fanOut(n.id)
      return fo === 0 ? 0 : graph.crossModuleFanOut(n.id) / fo
    }),
  }

  const result = {}
  for (const [name, values] of Object.entries(metrics)) {
    result[name] = summarize(values)
  }
  return result
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length

  return {
    p50:  percentile(sorted, 0.50),
    p75:  percentile(sorted, 0.75),
    p90:  percentile(sorted, 0.90),
    p95:  percentile(sorted, 0.95),
    max:  sorted[n - 1],
    mean: values.reduce((s, v) => s + v, 0) / n,
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0
  const idx = Math.floor(p * (sorted.length - 1))
  return sorted[idx]
}
