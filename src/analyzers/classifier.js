/**
 * Archetype classifier — runs all detectors against every node.
 *
 * Returns a Map of nodeId -> Classification[]
 *
 * A Classification is:
 *   { archetype, label, emoji, confidence, reasons }
 *
 * Results are sorted by confidence descending.
 * A node with no matches gets an empty array (it's just... normal).
 */

import { computeStats } from './stats.js'
import { ALL_ARCHETYPES } from './archetypes.js'

/**
 * Classify all functions in the graph.
 *
 * @param {import('../graph/call-graph.js').CallGraph} graph
 * @returns {Map<string, Classification[]>}
 */
export function classify(graph) {
  const stats = computeStats(graph)
  const results = new Map()

  for (const node of graph.getAllNodes()) {
    const matches = []

    for (const archetype of ALL_ARCHETYPES) {
      const result = archetype.detect(node, graph, stats)
      if (result) {
        matches.push({
          archetype: archetype,
          label: archetype.label,
          emoji: archetype.emoji,
          description: archetype.description,
          confidence: result.confidence,
          reasons: result.reasons,
        })
      }
    }

    matches.sort((a, b) => b.confidence - a.confidence)
    results.set(node.id, matches)
  }

  return results
}

/**
 * Get all nodes that matched a specific archetype, sorted by confidence.
 *
 * @param {Map<string, Classification[]>} classifications
 * @param {string} archetypeLabel  e.g. 'The Boss'
 * @returns {{ nodeId, classification }[]}
 */
export function getByArchetype(classifications, archetypeLabel) {
  const matches = []
  for (const [nodeId, list] of classifications) {
    const match = list.find(c => c.label === archetypeLabel)
    if (match) matches.push({ nodeId, classification: match })
  }
  return matches.sort((a, b) => b.classification.confidence - a.classification.confidence)
}

/**
 * Summary: how many of each archetype exist?
 *
 * @param {Map<string, Classification[]>} classifications
 * @returns {Map<string, number>}
 */
export function archetypeCounts(classifications) {
  const counts = new Map()
  for (const list of classifications.values()) {
    for (const c of list) {
      counts.set(c.label, (counts.get(c.label) ?? 0) + 1)
    }
  }
  return counts
}

/**
 * @typedef {Object} Classification
 * @property {object} archetype
 * @property {string} label
 * @property {string} emoji
 * @property {string} description
 * @property {number} confidence
 * @property {string[]} reasons
 */
