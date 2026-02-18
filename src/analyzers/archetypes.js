/**
 * Archetype definitions.
 *
 * Each archetype is a detector function:
 *   (node, graph, stats) -> { matches, confidence, reasons }
 *
 * confidence is 0.0–1.0. reasons is a human-readable array explaining the match.
 * A function can match multiple archetypes — the classifier returns all that match.
 */

// --- THE BOSS ---
// High fan-in, relatively low fan-out. The load-bearing wall.
// Everything depends on it. It's a single point of failure.

export const BOSS = {
  label: 'The Boss',
  emoji: '👔',
  description: 'Everything depends on this. High fan-in, single point of failure.',

  detect(node, graph, stats) {
    const fi = graph.fanIn(node.id)
    const fo = graph.fanOut(node.id)
    const threshold = Math.max(stats.fanIn.p95, 5)

    if (fi < threshold) return null

    // Pure bosses have more dependents than dependencies
    const dominance = fo === 0 ? 1 : fi / (fi + fo)
    const confidence = Math.max(0.2, clamp(normalize(fi, threshold, stats.fanIn.max)))

    const reasons = [
      `${fi} functions depend on this (top ${topPct(fi, stats.fanIn)}%)`,
    ]
    if (dominance > 0.7) reasons.push('far more callers than callees — high single-point-of-failure risk')

    return { confidence, reasons }
  },
}

// --- THE WORKHORSE ---
// High complexity, high fan-out, lots of lines. Doing too much.
// The function that carries the codebase on its back.

export const WORKHORSE = {
  label: 'The Workhorse',
  emoji: '😰',
  description: 'High complexity, does too much, probably modified constantly.',

  detect(node, graph, stats) {
    const complexity = node.complexity
    const fanOut = graph.fanOut(node.id)
    const loc = node.linesOfCode

    // Need at least two of three metrics to be elevated (top 15%, not top 25%)
    const complexityHigh = complexity >= stats.complexity.p85
    const fanOutHigh     = fanOut     >= stats.fanOut.p85
    const locHigh        = loc        >= stats.linesOfCode.p85

    const score = [complexityHigh, fanOutHigh, locHigh].filter(Boolean).length
    if (score < 2) return null

    const confidence = clamp(
      0.4 * normalize(complexity, stats.complexity.p85, stats.complexity.max) +
      0.3 * normalize(fanOut, stats.fanOut.p85, stats.fanOut.max) +
      0.3 * normalize(loc, stats.linesOfCode.p85, stats.linesOfCode.max)
    )

    const reasons = []
    if (complexityHigh) reasons.push(`complexity ${complexity} (top ${topPct(complexity, stats.complexity)}%)`)
    if (fanOutHigh)     reasons.push(`calls ${fanOut} functions (top ${topPct(fanOut, stats.fanOut)}%)`)
    if (locHigh)        reasons.push(`${loc} lines (top ${topPct(loc, stats.linesOfCode)}%)`)

    return { confidence, reasons }
  },
}

// --- THE GOSSIP ---
// Calls into many unrelated modules. Spreads coupling across the codebase.
// Not necessarily complex — just reaching everywhere.

export const GOSSIP = {
  label: 'The Gossip',
  emoji: '🗣️',
  description: 'Calls into many unrelated modules, spreading coupling everywhere.',

  detect(node, graph, stats) {
    const cmfo = graph.crossModuleFanOut(node.id)
    const fo = graph.fanOut(node.id)
    const ratio = fo === 0 ? 0 : cmfo / fo

    const absoluteHigh = cmfo >= Math.max(stats.crossModuleFanOut.p90, 3)
    const ratioHigh    = ratio >= 0.8 && fo >= 3

    if (!absoluteHigh && !ratioHigh) return null

    const confidence = clamp(
      0.6 * normalize(cmfo, stats.crossModuleFanOut.p75, stats.crossModuleFanOut.max) +
      0.4 * ratio
    )

    const reasons = [
      `calls into ${cmfo} different modules`,
    ]
    if (ratioHigh) reasons.push(`${Math.round(ratio * 100)}% of its calls cross module boundaries`)

    return { confidence, reasons }
  },
}

// --- THE HERMIT ---
// Fan-in is zero. Nobody calls this. Either dead code or an entry point.

export const HERMIT = {
  label: 'The Hermit',
  emoji: '👻',
  description: 'No callers — dead code candidate or forgotten entry point.',

  detect(node, graph, stats) {
    const fi = graph.fanIn(node.id)
    if (fi > 0) return null

    // Distinguish likely entry points from true dead code
    const likelyEntryPoint = ENTRY_POINT_NAMES.has(node.name.toLowerCase()) ||
      node.name.startsWith('handle') ||
      node.name.startsWith('on') ||
      node.name.startsWith('route')

    const fo = graph.fanOut(node.id)
    const confidence = likelyEntryPoint ? 0.3 : clamp(0.5 + 0.5 * normalize(fo, 0, stats.fanOut.max))

    const reasons = ['no callers found in this codebase']
    if (likelyEntryPoint) reasons.push('name suggests entry point — may be called externally')
    if (fo === 0)         reasons.push('also calls nothing — likely truly isolated')

    return { confidence, reasons }
  },
}

const ENTRY_POINT_NAMES = new Set([
  'main', 'index', 'start', 'init', 'setup', 'bootstrap',
  'default', 'app', 'server', 'listen',
  'get', 'post', 'put', 'patch', 'delete',  // HTTP verbs
])

// --- THE STRANGER ---
// Lives in a module but almost all its relationships are elsewhere.
// It probably belongs somewhere else.

export const STRANGER = {
  label: 'The Stranger',
  emoji: '🚶',
  description: 'Lives in the wrong module — most of its relationships are elsewhere.',

  detect(node, graph, stats) {
    const fo = graph.fanOut(node.id)
    const cmfo = graph.crossModuleFanOut(node.id)
    const ratio = fo === 0 ? 0 : cmfo / fo

    // Needs meaningful fan-out to have an opinion about where it belongs
    if (fo < 3) return null
    if (ratio < 0.75) return null

    const confidence = clamp(ratio * normalize(cmfo, 2, stats.crossModuleFanOut.max))

    const reasons = [
      `${Math.round(ratio * 100)}% of calls leave its own module`,
      `calls ${cmfo} functions in other modules, ${fo - cmfo} in its own`,
    ]

    return { confidence, reasons }
  },
}

// --- THE OVERLOADED ---
// High parameter count AND high complexity or fan-out.
// Being asked to do too many different things.

export const OVERLOADED = {
  label: 'The Overloaded',
  emoji: '🏋️',
  description: 'Too many responsibilities — high params, complexity, and reach.',

  detect(node, graph, stats) {
    const params = node.params
    const complexity = node.complexity
    const fo = graph.fanOut(node.id)

    const paramsHigh     = params     >= Math.max(stats.params.p90, 4)
    const complexityHigh = complexity >= stats.complexity.p75
    const fanOutHigh     = fo         >= stats.fanOut.p75

    // Needs high params PLUS at least one other signal
    if (!paramsHigh) return null
    if (!complexityHigh && !fanOutHigh) return null

    const confidence = clamp(
      0.5 * normalize(params, stats.params.p75, stats.params.max) +
      0.3 * normalize(complexity, stats.complexity.p50, stats.complexity.max) +
      0.2 * normalize(fo, stats.fanOut.p50, stats.fanOut.max)
    )

    const reasons = [`${params} parameters (top ${topPct(params, stats.params)}%)`]
    if (complexityHigh) reasons.push(`complexity ${complexity}`)
    if (fanOutHigh)     reasons.push(`calls ${fo} other functions`)

    return { confidence, reasons }
  },
}

// --- THE GHOST ---
// Has some callers but barely. Non-trivial code that's been mostly forgotten.

export const GHOST = {
  label: 'The Ghost',
  emoji: '💀',
  description: 'Barely called — non-trivial code that\'s been largely forgotten.',

  detect(node, graph, stats) {
    const fi = graph.fanIn(node.id)
    const complexity = node.complexity

    // Has some callers (not a hermit) but very few
    if (fi === 0 || fi > 2) return null

    // Non-trivial function that's barely used
    const nonTrivial = complexity >= stats.complexity.p50 || node.linesOfCode >= stats.linesOfCode.p50
    if (!nonTrivial) return null

    const confidence = 0.4 + 0.3 * normalize(complexity, stats.complexity.p50, stats.complexity.max)

    const reasons = [
      `only ${fi} caller${fi === 1 ? '' : 's'}`,
      `complexity ${complexity} suggests it's not trivial`,
    ]

    return { confidence, reasons }
  },
}

// --- THE CRISIS POINT ---
// Shows up disproportionately in bugfix commits.
// This is where fires start. Touch it carefully.

export const CRISIS_POINT = {
  label: 'The Crisis Point',
  emoji: '🔥',
  description: 'Disproportionate share of bug-fix commits — this is where fires start.',

  detect(node, graph, stats, context) {
    const m = context?.gitMetrics?.get(node.id)
    if (!m || m.commits < 5) return null

    const fixRatio = m.fixCommits / m.commits
    if (fixRatio < 0.4) return null

    const confidence = Math.max(0.2, clamp(normalize(fixRatio, 0.4, 1.0)))
    const reasons = [
      `${m.fixCommits} of ${m.commits} commits were bug fixes (${Math.round(fixRatio * 100)}%)`,
    ]
    if (m.authors.size > 2) reasons.push(`touched by ${m.authors.size} different authors — high turbulence`)

    return { confidence, reasons }
  },
}

// --- THE CODEPENDENT ---
// Always changes alongside another specific function.
// They're practically one unit — but live in separate places.

export const CODEPENDENT = {
  label: 'The Codependent',
  emoji: '🔗',
  description: 'Always changes with another function — they may need to be merged or co-located.',

  detect(node, graph, stats, context) {
    if (!context?.gitMetrics) return null
    const { strongestPartner } = context

    const partner = strongestPartner(node.id, context.gitMetrics)
    if (!partner) return null
    if (partner.correlation < 0.5) return null
    if (partner.coCount < 3) return null

    const partnerNode = graph.getNode(partner.partnerId)
    const confidence = clamp(normalize(partner.correlation, 0.5, 1.0))
    const pct = Math.round(partner.correlation * 100)

    const reasons = [
      `${pct}% of changes also touch ${partnerNode?.name ?? partner.partnerId}`,
      `co-changed ${partner.coCount} times`,
    ]

    if (partnerNode && partnerNode.module !== node.module) {
      reasons.push(`partner lives in a different module — consider co-location`)
    }

    // Stash partner info for the reporter
    return { confidence, reasons, partnerNode }
  },
}

// --- Helpers ---

function clamp(v) { return Math.min(1, Math.max(0, v)) }

function normalize(value, min, max) {
  if (max === min) return 0
  return clamp((value - min) / (max - min))
}

// How far from the top is this value? Returns "top X%" string component (1 = very top).
// e.g. a value at the 94th percentile → topPct = 6 → "top 6%"
function topPct(value, stat) {
  return Math.max(1, 100 - stat.rank(value))
}

export const ALL_ARCHETYPES = [BOSS, WORKHORSE, GOSSIP, HERMIT, STRANGER, OVERLOADED, GHOST, CRISIS_POINT, CODEPENDENT]
