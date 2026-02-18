/**
 * Terminal reporter — the "society summary" output.
 *
 * Produces a readable portrait of a codebase's social structure:
 * characters of note, social health metrics, and top risks.
 */

import pc from 'picocolors'
import { archetypeCounts, getByArchetype } from '../analyzers/classifier.js'
import { ALL_ARCHETYPES } from '../analyzers/archetypes.js'
import { computeStats } from '../analyzers/stats.js'

const WIDTH = 72

/**
 * @param {import('../graph/call-graph.js').CallGraph} graph
 * @param {Map<string, import('../analyzers/classifier.js').Classification[]>} classifications
 * @param {{ path: string }} options
 */
export function report(graph, classifications, options = {}) {
  const lines = []
  const emit = (...args) => lines.push(args.join(''))

  const top = options.top ?? 4   // max entries shown per archetype

  const stats = computeStats(graph)
  const summary = graph.summary()
  const counts = archetypeCounts(classifications)

  // ── Header ──────────────────────────────────────────────────────────────

  emit()
  emit(pc.bold('  THE SOCIETY OF '), pc.cyan(pc.bold(options.path ?? '.')))
  emit()
  emit(
    '  ',
    dim(`${summary.functions} functions`), '  ·  ',
    dim(`${summary.calls} calls`), '  ·  ',
    dim(`${summary.resolved} resolved`), '  ·  ',
    dim(`${summary.crossModule} cross-module`),
  )
  emit('  ' + pc.dim('─'.repeat(WIDTH - 2)))
  emit()

  // ── Characters of Note ──────────────────────────────────────────────────

  const notableArchetypes = ALL_ARCHETYPES.filter(a =>
    a.label !== 'The Hermit' && a.label !== 'The Ghost' && a.label !== 'The Codependent'
  )

  const hasNotable = notableArchetypes.some(a => (counts.get(a.label) ?? 0) > 0)

  if (hasNotable) {
    emit('  ' + pc.bold('CHARACTERS OF NOTE'))
    emit('  ' + pc.dim('─'.repeat(WIDTH - 2)))

    for (const archetype of notableArchetypes) {
      const matches = getByArchetype(classifications, archetype.label)
      if (matches.length === 0) continue

      emit()
      emit('  ', pc.bold(`${archetype.emoji}  ${archetype.label.toUpperCase()}`))

      const show = matches.slice(0, top)
      for (const { nodeId, classification } of show) {
        const node = graph.getNode(nodeId)
        emitFunctionBlock(emit, node, graph, classification)
      }

      if (matches.length > top) {
        const pct = Math.round((matches.length / summary.functions) * 100)
        emit('     ', pc.dim(`… and ${matches.length - top} more  (${pct}% of codebase)`))
      }
    }
    emit()
    emit('  ' + pc.dim('─'.repeat(WIDTH - 2)))
  }

  // ── Codependents (pair view) ─────────────────────────────────────────────

  emitCodependents(emit, graph, classifications, top)

  // ── Hermits & Ghosts (compact) ───────────────────────────────────────────

  emitCompactArchetype(emit, graph, classifications, 'The Hermit', '👻',
    'No callers found — dead code candidates or external entry points.')

  emitCompactArchetype(emit, graph, classifications, 'The Ghost', '💀',
    'Barely called — non-trivial code that may be forgotten.')

  // ── Social Health ────────────────────────────────────────────────────────

  emit()
  emit('  ' + pc.bold('SOCIAL HEALTH'))
  emit('  ' + pc.dim('─'.repeat(WIDTH - 2)))
  emit()

  const totalFunctions = summary.functions
  const hermitCount = counts.get('The Hermit') ?? 0
  const isolationRate = totalFunctions > 0 ? hermitCount / totalFunctions : 0
  const bossMatches = getByArchetype(classifications, 'The Boss')
  const topBoss = bossMatches[0]

  // Isolation
  const isolationBar = bar(isolationRate, 1)
  const isolationLabel = isolationRate > 0.5
    ? pc.red('high — check for dead code')
    : isolationRate > 0.3
      ? pc.yellow('moderate')
      : pc.green('healthy')
  emit(
    '  ', pad('Isolation', 18), isolationBar, '  ',
    pc.bold(`${Math.round(isolationRate * 100)}%`), '  ', isolationLabel
  )

  // Concentration (how much fan-in does the top boss hold?)
  if (topBoss) {
    const topFanIn = graph.fanIn(topBoss.nodeId)
    const totalFanIn = [...graph.nodes.keys()].reduce((s, id) => s + graph.fanIn(id), 0)
    const concentration = totalFanIn > 0 ? topFanIn / totalFanIn : 0
    const concentrationLabel = concentration > 0.3
      ? pc.red(`${graph.getNode(topBoss.nodeId)?.name} carries ${Math.round(concentration * 100)}% of all traffic`)
      : pc.green('distributed')
    emit(
      '  ', pad('Concentration', 18), bar(concentration, 1), '  ',
      pc.bold(`${Math.round(concentration * 100)}%`), '  ', concentrationLabel
    )
  }

  // Average complexity
  const avgComplexity = stats.complexity?.mean ?? 0
  const complexityLabel = avgComplexity > 8
    ? pc.red('high — significant refactor opportunity')
    : avgComplexity > 4
      ? pc.yellow('moderate')
      : pc.green('manageable')
  emit(
    '  ', pad('Avg complexity', 18), bar(avgComplexity, stats.complexity?.max ?? 1), '  ',
    pc.bold(avgComplexity.toFixed(1)), '  ', complexityLabel
  )

  // Cross-module coupling
  const couplingRate = summary.calls > 0 ? summary.crossModule / summary.calls : 0
  const couplingLabel = couplingRate > 0.5
    ? pc.red('high coupling across module boundaries')
    : couplingRate > 0.25
      ? pc.yellow('moderate')
      : pc.green('well-contained')
  emit(
    '  ', pad('Cross-module', 18), bar(couplingRate, 1), '  ',
    pc.bold(`${Math.round(couplingRate * 100)}%`), '  ', couplingLabel
  )

  // ── Top Risks ────────────────────────────────────────────────────────────

  const risks = computeRisks(graph, classifications)

  if (risks.length > 0) {
    emit()
    emit('  ' + pc.bold('TOP RISKS'))
    emit('  ' + pc.dim('─'.repeat(WIDTH - 2)))
    emit()

    for (let i = 0; i < risks.length; i++) {
      const risk = risks[i]
      emit(
        '  ', pc.bold(`${i + 1}.`), ' ',
        pc.yellow(risk.name), '  ',
        pc.dim(risk.location)
      )
      emit('     ', risk.reason)
      emit()
    }
  }

  return lines.join('\n')
}

// ── Section helpers ──────────────────────────────────────────────────────────

function emitFunctionBlock(emit, node, graph, classification) {
  if (!node) return

  const name    = pc.bold(pc.white(pad(node.name, 28)))
  const loc     = pc.dim(`${node.relPath}:${node.line}`)
  const conf    = pc.dim(`${Math.round(classification.confidence * 100)}%`)
  const metrics = [
    `fi=${graph.fanIn(node.id)}`,
    `fo=${graph.fanOut(node.id)}`,
    `cx=${node.complexity}`,
  ].join('  ')

  emit('     ', name, '  ', loc)
  emit('     ', pc.dim(metrics), '  ', conf)
  for (const reason of classification.reasons) {
    emit('     ', pc.dim('• '), pc.dim(reason))
  }
}

function emitCodependents(emit, graph, classifications, top) {
  const matches = getByArchetype(classifications, 'The Codependent')
  if (matches.length === 0) return

  // Deduplicate pairs — if A↔B is shown, don't show B↔A
  const seen = new Set()
  const pairs = []

  for (const { nodeId, classification } of matches) {
    const partner = classification.partnerNode
    if (!partner) continue
    const key = [nodeId, partner.id].sort().join('::')
    if (seen.has(key)) continue
    seen.add(key)
    pairs.push({ nodeId, classification, partner })
  }

  if (pairs.length === 0) return

  emit()
  emit('  ', pc.bold(`🔗  THE CODEPENDENT`), '  ', pc.dim(`(${pairs.length} pair${pairs.length === 1 ? '' : 's'})`))
  emit('  ', pc.dim('Always change together — may need to be merged or co-located.'))
  emit()

  for (const { nodeId, classification, partner } of pairs.slice(0, top)) {
    const node = graph.getNode(nodeId)
    if (!node) continue
    const pct = Math.round(classification.confidence * 100 + 50)  // unnormalize from 0-1 back to 50-100%
    emit(
      '     ',
      pc.bold(pc.white(pad(node.name, 24))),
      pc.dim('  ↔  '),
      pc.bold(pc.white(pad(partner.name, 24))),
    )
    for (const reason of classification.reasons) {
      emit('     ', pc.dim('• '), pc.dim(reason))
    }
    if (partner.module !== node.module) {
      emit('     ', pc.dim('• '), pc.yellow(`different modules: ${node.module} vs ${partner.module}`))
    }
  }

  if (pairs.length > top) {
    emit('     ', pc.dim(`… and ${pairs.length - top} more pairs`))
  }
}

function emitCompactArchetype(emit, graph, classifications, label, emoji, description) {
  const matches = getByArchetype(classifications, label)
  if (matches.length === 0) return

  emit()
  emit('  ', pc.bold(`${emoji}  ${label.toUpperCase()}`), '  ', pc.dim(`(${matches.length})`))
  emit('  ', pc.dim(description))

  // Show up to 5, prioritize high-confidence and high-complexity ones
  const interesting = matches
    .filter(({ nodeId }) => {
      const n = graph.getNode(nodeId)
      return n && (n.complexity > 2 || graph.fanOut(nodeId) > 2)
    })
    .slice(0, 5)

  if (interesting.length > 0) {
    for (const { nodeId, classification } of interesting) {
      const node = graph.getNode(nodeId)
      emit(
        '     ',
        pc.dim('→ '),
        pad(node.name, 28),
        '  ',
        pc.dim(`${node.relPath}:${node.line}`),
        pc.dim(`  cx=${node.complexity} fo=${graph.fanOut(nodeId)}`),
      )
    }
  }

  const trivial = matches.length - interesting.length
  if (trivial > 0) {
    emit('     ', pc.dim(`+ ${trivial} trivial`))
  }
}

// ── Risk computation ─────────────────────────────────────────────────────────

function computeRisks(graph, classifications) {
  const risks = []

  // Single points of failure
  const bosses = getByArchetype(classifications, 'The Boss')
  for (const { nodeId, classification } of bosses.slice(0, 2)) {
    const node = graph.getNode(nodeId)
    if (!node) continue
    const fi = graph.fanIn(nodeId)
    risks.push({
      name: node.name,
      location: `${node.relPath}:${node.line}`,
      reason: `${fi} dependents — removing or breaking this will cascade broadly`,
      score: classification.confidence * fi,
    })
  }

  // Complexity bombs
  const overloaded = getByArchetype(classifications, 'The Overloaded')
  const workhorses = getByArchetype(classifications, 'The Workhorse')
  const complexTargets = [...overloaded, ...workhorses]
    .sort((a, b) => {
      const ca = graph.getNode(a.nodeId)?.complexity ?? 0
      const cb = graph.getNode(b.nodeId)?.complexity ?? 0
      return cb - ca
    })
    .slice(0, 2)

  for (const { nodeId } of complexTargets) {
    const node = graph.getNode(nodeId)
    if (!node) continue
    if (risks.some(r => r.name === node.name)) continue  // already listed
    risks.push({
      name: node.name,
      location: `${node.relPath}:${node.line}`,
      reason: `complexity ${node.complexity}, ${node.params} params — prime candidate for decomposition`,
      score: node.complexity * node.params,
    })
  }

  // Module-level coupling: find the most gossip-dense module
  const gossips = getByArchetype(classifications, 'The Gossip')
  if (gossips.length >= 2) {
    const moduleCounts = new Map()
    for (const { nodeId } of gossips) {
      const m = graph.getNode(nodeId)?.module
      if (m) moduleCounts.set(m, (moduleCounts.get(m) ?? 0) + 1)
    }
    const [worstModule, worstCount] = [...moduleCounts.entries()]
      .sort((a, b) => b[1] - a[1])[0] ?? []
    if (worstModule && worstCount >= 2) {
      risks.push({
        name: worstModule + '/',
        location: 'module',
        reason: `${worstCount} Gossips in one module — this module is spreading coupling everywhere`,
        score: worstCount * 10,
      })
    }
  }

  // Crisis points — fire magnets
  const crisisPoints = getByArchetype(classifications, 'The Crisis Point')
  for (const { nodeId, classification } of crisisPoints.slice(0, 2)) {
    const node = graph.getNode(nodeId)
    if (!node || risks.some(r => r.name === node.name)) continue
    risks.push({
      name: node.name,
      location: `${node.relPath}:${node.line}`,
      reason: classification.reasons[0],
      score: classification.confidence * 100,
    })
  }

  // High-complexity ghost — forgotten complexity
  const ghosts = getByArchetype(classifications, 'The Ghost')
  const complexGhost = ghosts
    .map(({ nodeId, classification }) => ({ nodeId, classification, cx: graph.getNode(nodeId)?.complexity ?? 0 }))
    .sort((a, b) => b.cx - a.cx)[0]
  if (complexGhost && complexGhost.cx >= 5) {
    const node = graph.getNode(complexGhost.nodeId)
    if (node && !risks.some(r => r.name === node.name)) {
      risks.push({
        name: node.name,
        location: `${node.relPath}:${node.line}`,
        reason: `complexity ${complexGhost.cx} but barely called — important logic may be rotting`,
        score: complexGhost.cx,
      })
    }
  }

  return risks.sort((a, b) => b.score - a.score).slice(0, 5)
}

// ── Utilities ────────────────────────────────────────────────────────────────

function bar(value, max, width = 10) {
  const filled = Math.round(clamp(value / max) * width)
  const full   = '█'.repeat(filled)
  const empty  = '░'.repeat(width - filled)
  const color  = filled >= width * 0.8 ? pc.red : filled >= width * 0.5 ? pc.yellow : pc.green
  return color(full) + pc.dim(empty)
}

function pad(str, length) {
  const s = str ?? ''
  if (s.length > length) return s.slice(0, length - 1) + '…'
  return s.padEnd(length)
}

function dim(s) { return pc.dim(s) }

function clamp(v) { return Math.min(1, Math.max(0, v)) }
