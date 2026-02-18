/**
 * Diff terminal reporter — renders a DiffResult as a readable terminal report.
 */

import pc from 'picocolors'

const WIDTH = 72

const ARCHETYPE_COLORS = {
  'The Boss':         pc.yellow,
  'The Workhorse':    pc.red,
  'The Gossip':       pc.magenta,
  'The Hermit':       pc.gray,
  'The Stranger':     pc.cyan,
  'The Overloaded':   (s) => pc.yellow(s),
  'The Ghost':        pc.gray,
  'The Crisis Point': pc.red,
  'The Codependent':  (s) => pc.magenta(s),
}

function colorArchetype(label) {
  return (ARCHETYPE_COLORS[label] ?? pc.blue)(label)
}

/**
 * @param {import('../diff/diff-classifier.js').DiffResult} diffResult
 * @param {{ verbose?: boolean }} options
 * @returns {string}
 */
export function report(diffResult, options = {}) {
  const { verbose = false } = options
  const { beforeRef, afterRef, diffs, summary } = diffResult

  const lines = []
  const emit = (...args) => lines.push(args.join(''))

  // ── Header ─────────────────────────────────────────────────────────────
  emit()
  emit(pc.bold('  SOCIOGRAPH DIFF  ') +
    pc.cyan(beforeRef) + pc.dim(' → ') + pc.cyan(afterRef))
  emit(pc.dim('  ' + '─'.repeat(WIDTH - 2)))

  // ── Summary line ───────────────────────────────────────────────────────
  const parts = []
  if (summary.stressed  > 0) parts.push(pc.red(`${summary.stressed} stressed`))
  if (summary.improved  > 0) parts.push(pc.green(`${summary.improved} improved`))
  if (summary.added     > 0) parts.push(pc.blue(`${summary.added} new`))
  if (summary.removed   > 0) parts.push(pc.dim(`${summary.removed} removed`))
  if (summary.unchanged > 0) parts.push(pc.dim(`${summary.unchanged} unchanged`))
  emit('  ' + (parts.length ? parts.join(pc.dim('  ·  ')) : pc.dim('no notable changes')))
  emit()

  const notable = diffs.filter(d => {
    if (verbose) return true
    // In non-verbose mode, skip new functions with no archetypes and neutral changes
    if (d.verdict === 'new' && d.archetypesGained.length === 0) return false
    if (d.verdict === 'neutral') return false
    return true
  })

  if (notable.length === 0) {
    emit(pc.dim('  No notable changes.'))
    emit()
    return lines.join('\n')
  }

  // ── Stressed ───────────────────────────────────────────────────────────
  const stressed = notable.filter(d => d.verdict === 'stressed')
  if (stressed.length > 0) {
    for (const diff of stressed) emitDiff(emit, diff)
    emit()
  }

  // ── New functions with archetypes ──────────────────────────────────────
  const newWithArchetypes = notable.filter(d => d.verdict === 'new' && d.archetypesGained.length > 0)
  const newPlain          = notable.filter(d => d.verdict === 'new' && d.archetypesGained.length === 0)
  for (const diff of newWithArchetypes) emitDiff(emit, diff)
  if (newWithArchetypes.length > 0) emit()

  // ── Improved ───────────────────────────────────────────────────────────
  const improved = notable.filter(d => d.verdict === 'improved')
  if (improved.length > 0) {
    for (const diff of improved) emitDiff(emit, diff)
    emit()
  }

  // ── Removed ────────────────────────────────────────────────────────────
  const removed = notable.filter(d => d.verdict === 'gone')
  if (removed.length > 0) {
    for (const diff of removed) emitDiff(emit, diff)
    emit()
  }

  // ── Plain new (verbose only, already filtered above if not verbose) ────
  if (verbose && newPlain.length > 0) {
    emit(pc.dim(`  ${newPlain.length} new functions with no archetypes`))
    emit()
  }

  // ── Footer ─────────────────────────────────────────────────────────────
  emit(pc.dim('  ' + '─'.repeat(WIDTH - 2)))
  emit()

  return lines.join('\n')
}

// --- Single diff entry formatter ---

function emitDiff(emit, diff) {
  const icon   = verdictIcon(diff)
  const name   = pc.bold(truncate(diff.name, 28))
  const path   = pc.dim(truncate(diff.relPath, 38))
  emit(`  ${icon}  ${name.padEnd(28)}  ${path}`)

  for (const signal of diff.signals) {
    emit(`       ${formatSignal(signal, diff.verdict)}`)
  }

  // Archetype transition summary
  if (diff.kind === 'changed') {
    const before = diff.archetypesBefore
    const after  = diff.archetypesAfter
    if (before.length > 0 || after.length > 0) {
      const bStr = before.length ? before.map(colorArchetype).join(', ') : pc.dim('normal')
      const aStr = after.length  ? after.map(colorArchetype).join(', ')  : pc.dim('normal')
      if (bStr !== aStr) emit(`       ${bStr}  ${pc.dim('→')}  ${aStr}`)
    }
  }
}

function verdictIcon(diff) {
  switch (diff.verdict) {
    case 'stressed': return '⚠️ '
    case 'improved': return '✅'
    case 'new':      return '🆕'
    case 'gone':     return pc.dim('❌')
    default:         return '  '
  }
}

function formatSignal(signal, verdict) {
  // Color metric changes by direction
  if (/\+\d/.test(signal) && verdict === 'stressed') return pc.red(signal)
  if (/-\d/.test(signal)  && verdict === 'improved') return pc.green(signal)
  // Archetype signals
  if (signal.startsWith('gained:')) return pc.red(signal)
  if (signal.startsWith('lost:'))   return pc.green(signal)
  return pc.dim(signal)
}

function truncate(str, max) {
  if (!str) return ''
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}
