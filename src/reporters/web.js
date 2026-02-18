/**
 * Web reporter — generates a self-contained HTML file with a D3 force graph.
 *
 * buildGraphPayload(graph, classifications, options)
 *   → serializable payload embedded as window.__SOCIOGRAPH__
 *
 * report(graph, classifications, options)
 *   → full HTML string, ready to write to a file
 */

import { getStyles } from './web-styles.js'
import { getAppScript } from './web-script.js'

// How many nodes to display before truncating (progressive caps by codebase size)
const NODE_CAPS = [
  [500,  500],
  [2000, 800],
  [Infinity, 1200],
]

function nodeCap(total) {
  for (const [limit, cap] of NODE_CAPS) {
    if (total <= limit) return cap
  }
  return 1200
}

/**
 * Compute importance score for a node to decide what survives truncation.
 * Higher = more important, keep first.
 */
function importance(node, graph, classificationList) {
  return (graph.fanIn(node.id) * 2)
    + graph.fanOut(node.id)
    + (node.complexity * 0.5)
    + (classificationList.length * 5)
}

/**
 * Detect communities via a simple greedy module-based fallback.
 * We try graphology-communities-louvain if available; otherwise assign
 * community = module name (string, which we'll stable-index).
 */
async function detectCommunities(nodes) {
  // Build a simple module → integer index map
  const moduleIndex = new Map()
  let nextIdx = 0
  const result = {}
  for (const node of nodes) {
    if (!moduleIndex.has(node.module)) {
      moduleIndex.set(node.module, nextIdx++)
    }
    result[node.id] = moduleIndex.get(node.module)
  }
  return result
}

/**
 * Serialize GitMetrics safely — Sets become counts, Maps are dropped.
 */
function serializeGitMetrics(gitMetrics, nodeIds) {
  if (!gitMetrics) return null
  const out = {}
  for (const id of nodeIds) {
    const m = gitMetrics.get(id)
    if (!m || m.commits === 0) continue
    out[id] = {
      commits:    m.commits,
      fixCommits: m.fixCommits,
      authors:    m.authors.size,
      firstSeen:  m.firstSeen?.toISOString?.() ?? null,
      lastSeen:   m.lastSeen?.toISOString?.()  ?? null,
    }
  }
  return out
}

/**
 * Build the full graph payload for the web reporter.
 */
export async function buildGraphPayload(graph, classifications, options = {}) {
  const { gitMetrics, path: displayPath = '.' } = options

  const allNodes = graph.getAllNodes()
  const cap = nodeCap(allNodes.length)
  const truncated = allNodes.length > cap

  // Score and rank nodes
  const scored = allNodes.map(node => ({
    node,
    score: importance(node, graph, classifications.get(node.id) ?? []),
  }))
  scored.sort((a, b) => b.score - a.score)

  const kept = scored.slice(0, cap).map(s => s.node)
  const keptIds = new Set(kept.map(n => n.id))

  // Build node list — field names must match what web-script.js expects
  const nodes = kept.map(node => {
    const cls = classifications.get(node.id) ?? []
    const gm  = gitMetrics?.get(node.id)
    return {
      id:          node.id,
      name:        node.name,
      relPath:     node.relPath,   // script uses d.relPath
      module:      node.module,
      line:        node.line,
      fanIn:       graph.fanIn(node.id),
      fanOut:      graph.fanOut(node.id),
      complexity:  node.complexity,
      linesOfCode: node.linesOfCode,  // script uses d.linesOfCode
      params:      node.params,
      archetypes:  cls.map(c => ({
        label:       c.label,
        emoji:       c.emoji,
        confidence:  c.confidence,
        reasons:     c.reasons,
        partnerName: c.partnerNode?.name ?? null,
        partnerId:   c.partnerNode?.id   ?? null,
      })),
      // Per-node git metrics (null if no data)
      gitMetrics: (gm && gm.commits > 0) ? {
        commits:      gm.commits,
        fixCommits:   gm.fixCommits,
        authorsCount: gm.authors.size,
        firstSeen:    gm.firstSeen?.toISOString?.() ?? null,
        lastSeen:     gm.lastSeen?.toISOString?.()  ?? null,
      } : null,
    }
  })

  // Build edge list — only edges where both endpoints are in keptIds
  // D3 forceLink expects source/target field names
  const edges = graph.edges
    .filter(e => keptIds.has(e.from) && keptIds.has(e.to))
    .map(e => ({
      source:      e.from,
      target:      e.to,
      crossModule: e.crossModule,
    }))

  const communities = await detectCommunities(kept)

  const git = serializeGitMetrics(gitMetrics, keptIds)

  // Archetype census (across full graph, not just kept nodes)
  const archetypeCounts = {}
  for (const cls of classifications.values()) {
    for (const c of cls) {
      archetypeCounts[c.label] = (archetypeCounts[c.label] ?? 0) + 1
    }
  }

  return {
    meta: {
      path:              displayPath,
      totalFunctions:    allNodes.length,
      renderedFunctions: kept.length,
      totalEdges:        graph.edges.length,
      truncated,
    },
    nodes,
    edges,
    communities,
    git,
    archetypeCounts,
  }
}

/**
 * Generate the full self-contained HTML string.
 */
export async function report(graph, classifications, options = {}) {
  const payload = await buildGraphPayload(graph, classifications, options)
  const json = JSON.stringify(payload)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>sociograph — ${payload.meta.path}</title>
<style>${getStyles()}</style>
</head>
<body>
<div id="app">
  <div id="toolbar">
    <div id="toolbar-title">socio<span>graph</span></div>
    <div id="toolbar-stats"></div>
    <div id="toolbar-sep"></div>
    <input id="search" type="text" placeholder="search functions…" autocomplete="off" spellcheck="false">
    <div id="filter-bar"></div>
  </div>
  <div id="graph-container">
    <svg id="graph"></svg>
    <div id="graph-controls">
      <button class="graph-btn" id="btn-fit" title="Fit view">⊡</button>
      <button class="graph-btn" id="btn-zoom-in" title="Zoom in">+</button>
      <button class="graph-btn" id="btn-zoom-out" title="Zoom out">−</button>
    </div>
  </div>
  <div id="sidebar">
    <div id="sidebar-empty">
      <div class="hint">↖</div>
      Click any node to inspect it
    </div>
    <div id="profile">
      <div id="profile-header">
        <div id="profile-name"></div>
        <div id="profile-location"></div>
      </div>
      <div id="profile-archetypes"></div>
      <div class="archetype-reasons">
        <div id="archetype-reasons"></div>
      </div>
      <div id="profile-metrics">
        <div class="metric-item"><div class="metric-label">Fan-in</div><div class="metric-value" id="m-fanin">—</div></div>
        <div class="metric-item"><div class="metric-label">Fan-out</div><div class="metric-value" id="m-fanout">—</div></div>
        <div class="metric-item"><div class="metric-label">Complexity</div><div class="metric-value" id="m-cx">—</div></div>
        <div class="metric-item"><div class="metric-label">Lines</div><div class="metric-value" id="m-loc">—</div></div>
        <div class="metric-item"><div class="metric-label">Params</div><div class="metric-value" id="m-params">—</div></div>
        <div class="metric-item"><div class="metric-label">Module</div><div class="metric-value" id="m-module">—</div></div>
      </div>
      <div id="profile-git">
        <div class="git-label">Git History</div>
        <div class="git-row"><span>Commits</span><strong id="g-commits">—</strong></div>
        <div class="git-row"><span>Bug fixes</span><strong id="g-fixes">—</strong></div>
        <div class="git-row"><span>Authors</span><strong id="g-authors">—</strong></div>
        <div class="git-row"><span>First seen</span><strong id="g-first">—</strong></div>
        <div class="git-row"><span>Last seen</span><strong id="g-last">—</strong></div>
        <div class="fix-bar-bg"><div class="fix-bar-fill" id="g-fix-bar" style="width:0%"></div></div>
      </div>
      <div id="profile-connections">
        <div class="conn-section">
          <div class="conn-label" id="caller-header">CALLERS</div>
          <div id="caller-list"></div>
        </div>
        <div class="conn-section">
          <div class="conn-label" id="callee-header">CALLEES</div>
          <div id="callee-list"></div>
        </div>
      </div>
    </div>
  </div>
</div>
<div id="truncation-banner" style="display:none">
  <span id="truncation-msg"></span>
  <button id="truncation-close" title="Dismiss">×</button>
</div>
<script>window.__SOCIOGRAPH__ = ${json};</script>
<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
<script>${getAppScript()}</script>
</body>
</html>`
}
