/**
 * Threshold evaluator — given a DiffResult and config, decides
 * what passes, what warns, and what fails.
 *
 * @typedef {Object} Evaluation
 * @property {boolean}  passed
 * @property {string[]} violations   — threshold failures (cause exit 1)
 * @property {import('../diff/diff-classifier.js').FunctionDiff[]} newBridges
 * @property {import('../diff/diff-classifier.js').FunctionDiff[]} watchedGains
 */

/**
 * @param {import('../diff/diff-classifier.js').DiffResult} diffResult
 * @param {import('./config.js').DEFAULTS} config
 * @returns {Evaluation}
 */
export function evaluate(diffResult, config) {
  const { diffs, summary } = diffResult
  const { thresholds, watch_archetypes } = config

  const violations = []

  // Max stressed threshold
  if (summary.stressed >= thresholds.max_stressed) {
    violations.push(
      `${summary.stressed} stressed functions ≥ threshold of ${thresholds.max_stressed}`
    )
  }

  // New Bridge archetype
  const newBridges = diffs.filter(d =>
    d.archetypesGained.includes('The Bridge')
  )
  if (thresholds.fail_on_new_bridge && newBridges.length > 0) {
    violations.push(
      `${newBridges.length} function${newBridges.length > 1 ? 's' : ''} gained The Bridge archetype`
    )
  }

  // Watched archetypes gained (informational, not a violation)
  const watchSet = new Set(watch_archetypes)
  const watchedGains = diffs.filter(d =>
    d.archetypesGained.some(a => watchSet.has(a))
  )

  return {
    passed:      violations.length === 0,
    violations,
    newBridges,
    watchedGains,
  }
}
