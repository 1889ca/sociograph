/**
 * Diff JSON reporter — serializes a DiffResult to a clean JSON string
 * suitable for CI consumption and machine parsing.
 *
 * The DiffResult is fully JSON-serializable (NodeSnapshots contain only
 * primitives). We add a `meta` envelope and strip the verbose `before`/`after`
 * snapshot blobs from the default output to keep size reasonable.
 */

/**
 * @param {import('../diff/diff-classifier.js').DiffResult} diffResult
 * @param {{ verbose?: boolean }} options
 * @returns {string}
 */
export function report(diffResult, options = {}) {
  const { verbose = false } = options
  const { beforeRef, afterRef, diffs, summary } = diffResult

  const output = diffs.map(d => {
    const entry = {
      kind:              d.kind,
      name:              d.name,
      relPath:           d.relPath,
      module:            d.module,
      verdict:           d.verdict,
      signals:           d.signals,
      archetypesBefore:  d.archetypesBefore,
      archetypesAfter:   d.archetypesAfter,
      archetypesGained:  d.archetypesGained,
      archetypesLost:    d.archetypesLost,
      delta:             d.delta,
    }
    if (verbose) {
      entry.before = d.before
      entry.after  = d.after
    }
    return entry
  })

  return JSON.stringify({
    meta: {
      tool:      'sociograph',
      beforeRef,
      afterRef,
      timestamp: new Date().toISOString(),
    },
    summary,
    diffs: output,
  }, null, 2)
}
