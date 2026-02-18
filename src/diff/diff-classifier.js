/**
 * Diff Classifier — pure comparison of two NodeSnapshot maps.
 *
 * Returns a DiffResult with every notable FunctionDiff sorted by severity.
 */

/**
 * @typedef {Object} MetricDelta
 * @property {number} complexity
 * @property {number} fanIn
 * @property {number} fanOut
 * @property {number} crossModuleFanOut
 * @property {number} linesOfCode
 */

/**
 * @typedef {Object} FunctionDiff
 * @property {'changed'|'added'|'removed'} kind
 * @property {string}   stableKey
 * @property {string}   name
 * @property {string}   relPath
 * @property {string}   module
 * @property {MetricDelta} delta
 * @property {import('./snapshot.js').NodeSnapshot|null} before
 * @property {import('./snapshot.js').NodeSnapshot|null} after
 * @property {string[]} archetypesBefore
 * @property {string[]} archetypesAfter
 * @property {string[]} archetypesGained
 * @property {string[]} archetypesLost
 * @property {'stressed'|'improved'|'neutral'|'new'|'gone'} verdict
 * @property {string[]} signals   human-readable delta descriptions
 */

/**
 * @typedef {Object} DiffResult
 * @property {string}         beforeRef
 * @property {string}         afterRef
 * @property {FunctionDiff[]} diffs
 * @property {{ added: number, removed: number, stressed: number, improved: number, unchanged: number }} summary
 */

// Thresholds for what's notable. A delta must cross at least one to be surfaced.
export const THRESHOLDS = {
  stress: { complexity: 3, fanOut: 2, fanIn: 5, crossModuleFanOut: 2 },
  improve: { complexity: -3, fanOut: -2, fanIn: -5, crossModuleFanOut: -2 },
}

// Archetypes that are "concerning" — gaining one is notable, losing one is good.
const CONCERNING = new Set([
  'The Boss', 'The Workhorse', 'The Gossip', 'The Overloaded',
  'The Crisis Point', 'The Codependent', 'The Stranger',
])

/**
 * Compare two snapshots and produce a DiffResult.
 *
 * @param {Map<string, import('./snapshot.js').NodeSnapshot>} beforeMap
 * @param {Map<string, import('./snapshot.js').NodeSnapshot>} afterMap
 * @param {string} beforeRef
 * @param {string} afterRef
 * @returns {DiffResult}
 */
export function computeDiff(beforeMap, afterMap, beforeRef, afterRef) {
  const diffs = []
  let unchanged = 0

  // Added functions
  for (const [key, after] of afterMap) {
    if (!beforeMap.has(key)) {
      diffs.push(makeAdded(key, after))
    }
  }

  // Removed functions
  for (const [key, before] of beforeMap) {
    if (!afterMap.has(key)) {
      diffs.push(makeRemoved(key, before))
    }
  }

  // Changed functions
  for (const [key, before] of beforeMap) {
    const after = afterMap.get(key)
    if (!after) continue

    const diff = makeChanged(key, before, after)
    if (diff.verdict === 'neutral' && diff.archetypesGained.length === 0 && diff.archetypesLost.length === 0) {
      unchanged++
    } else {
      diffs.push(diff)
    }
  }

  // Sort: stressed first (by severity), then new+notable, then improved, then removed, then new+plain
  diffs.sort(sortDiffs)

  const summary = {
    added:     diffs.filter(d => d.kind === 'added').length,
    removed:   diffs.filter(d => d.kind === 'removed').length,
    stressed:  diffs.filter(d => d.verdict === 'stressed').length,
    improved:  diffs.filter(d => d.verdict === 'improved').length,
    unchanged,
  }

  return { beforeRef, afterRef, diffs, summary }
}

// --- Builders ---

function makeAdded(key, after) {
  const signals = after.archetypes.length > 0
    ? after.archetypes.map(a => a)
    : []
  return {
    kind: 'added',
    stableKey: key,
    name: after.name,
    relPath: after.relPath,
    module: after.module,
    delta: zeroDelta(),
    before: null,
    after,
    archetypesBefore: [],
    archetypesAfter: after.archetypes,
    archetypesGained: after.archetypes,
    archetypesLost: [],
    verdict: 'new',
    signals,
  }
}

function makeRemoved(key, before) {
  return {
    kind: 'removed',
    stableKey: key,
    name: before.name,
    relPath: before.relPath,
    module: before.module,
    delta: zeroDelta(),
    before,
    after: null,
    archetypesBefore: before.archetypes,
    archetypesAfter: [],
    archetypesGained: [],
    archetypesLost: before.archetypes,
    verdict: 'gone',
    signals: before.archetypes.length > 0 ? [`was: ${before.archetypes.join(', ')}`] : [],
  }
}

function makeChanged(key, before, after) {
  const delta = computeDelta(before, after)
  const archetypesBefore = before.archetypes
  const archetypesAfter  = after.archetypes
  const archetypesGained = archetypesAfter.filter(a => !archetypesBefore.includes(a))
  const archetypesLost   = archetypesBefore.filter(a => !archetypesAfter.includes(a))

  const { verdict, signals } = classify(delta, before, after, archetypesGained, archetypesLost)

  return {
    kind: 'changed',
    stableKey: key,
    name: after.name,
    relPath: after.relPath,
    module: after.module,
    delta,
    before,
    after,
    archetypesBefore,
    archetypesAfter,
    archetypesGained,
    archetypesLost,
    verdict,
    signals,
  }
}

// --- Core logic ---

function computeDelta(before, after) {
  return {
    complexity:        after.complexity        - before.complexity,
    fanIn:             after.fanIn             - before.fanIn,
    fanOut:            after.fanOut            - before.fanOut,
    crossModuleFanOut: after.crossModuleFanOut - before.crossModuleFanOut,
    linesOfCode:       after.linesOfCode       - before.linesOfCode,
  }
}

function classify(delta, before, after, archetypesGained, archetypesLost) {
  const signals = []
  let stressed = false
  let improved = false

  // Metric signals
  const checks = [
    ['complexity',        'complexity',         delta.complexity],
    ['fan-out',           'fanOut',             delta.fanOut],
    ['cross-module calls','crossModuleFanOut',  delta.crossModuleFanOut],
    ['fan-in',            'fanIn',              delta.fanIn],
    ['lines',             'linesOfCode',        delta.linesOfCode],
  ]

  for (const [label, key, value] of checks) {
    if (value === 0) continue
    const stressThresh  = THRESHOLDS.stress[key]
    const improveThresh = THRESHOLDS.improve[key]
    const sign = value > 0 ? '+' : ''
    if (stressThresh  !== undefined && value >= stressThresh)  { stressed = true; signals.push(`${label} ${sign}${value}`) }
    else if (improveThresh !== undefined && value <= improveThresh) { improved = true; signals.push(`${label} ${sign}${value}`) }
    else if (Math.abs(value) >= 1 && key === 'linesOfCode') {
      // LOC changes are informational — don't stress/improve but still surface if large
      if (Math.abs(value) >= 20) signals.push(`lines ${sign}${value}`)
    }
  }

  // Archetype signals — these can override neutral verdict
  for (const a of archetypesGained) {
    if (CONCERNING.has(a)) { stressed = true; signals.push(`gained: ${a}`) }
    else { signals.push(`gained: ${a}`) }
  }
  for (const a of archetypesLost) {
    if (CONCERNING.has(a)) { improved = true; signals.push(`lost: ${a}`) }
    else { signals.push(`lost: ${a}`) }
  }

  const verdict = stressed ? 'stressed' : improved ? 'improved' : 'neutral'
  return { verdict, signals }
}

// --- Sorting ---

function severityScore(diff) {
  const d = diff.delta
  return Math.abs(d.complexity) * 2 + Math.abs(d.fanOut) + Math.abs(d.crossModuleFanOut) + Math.abs(d.fanIn) * 0.5
}

function sortDiffs(a, b) {
  const order = { stressed: 0, new: 1, improved: 2, gone: 3, neutral: 4 }
  const ao = order[a.verdict] ?? 5
  const bo = order[b.verdict] ?? 5
  if (ao !== bo) return ao - bo
  if (a.verdict === 'stressed') return severityScore(b) - severityScore(a)
  if (a.verdict === 'new') {
    // New functions with concerning archetypes first
    const aConcerning = a.archetypesGained.filter(x => CONCERNING.has(x)).length
    const bConcerning = b.archetypesGained.filter(x => CONCERNING.has(x)).length
    return bConcerning - aConcerning
  }
  return 0
}

function zeroDelta() {
  return { complexity: 0, fanIn: 0, fanOut: 0, crossModuleFanOut: 0, linesOfCode: 0 }
}
