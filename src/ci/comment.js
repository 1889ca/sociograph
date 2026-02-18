/**
 * GitHub PR comment formatter.
 *
 * Produces a Markdown comment with a hidden sentinel so the action can
 * update it in place rather than creating a new comment on every push.
 */

export const SENTINEL = '<!-- sociograph-report -->'

/**
 * @param {import('../diff/diff-classifier.js').DiffResult} diffResult
 * @param {import('./evaluator.js').Evaluation} evaluation
 * @returns {string}
 */
export function formatComment(diffResult, evaluation) {
  const { beforeRef, afterRef, diffs, summary } = diffResult
  const { passed, violations, newBridges, watchedGains } = evaluation

  const lines = []
  const emit  = (...parts) => lines.push(parts.join(''))

  const short = ref => ref.length > 12 ? ref.slice(0, 8) + '…' : ref

  // ── Header ────────────────────────────────────────────────────────────────

  emit(SENTINEL)
  emit(`## 🔬 Sociograph — \`${short(beforeRef)} → ${short(afterRef)}\``)
  emit()

  // One-line summary
  const summaryParts = []
  if (summary.stressed  > 0) summaryParts.push(`⚠️ **${summary.stressed} stressed**`)
  if (summary.improved  > 0) summaryParts.push(`✅ ${summary.improved} improved`)
  if (summary.added     > 0) summaryParts.push(`🆕 ${summary.added} new`)
  if (summary.removed   > 0) summaryParts.push(`🗑️ ${summary.removed} removed`)
  if (summary.unchanged > 0) summaryParts.push(`${summary.unchanged} unchanged`)

  if (passed && summary.stressed === 0) {
    emit('✅ **No architectural regressions.** ', summaryParts.slice(1).join(' &nbsp;·&nbsp; '))
  } else {
    emit(summaryParts.join(' &nbsp;·&nbsp; '))
  }

  // ── Threshold violations ──────────────────────────────────────────────────

  if (violations.length > 0) {
    emit()
    emit('> ❌ **Failed thresholds:**')
    for (const v of violations) emit(`> - ${v}`)
  }

  // ── Stressed ──────────────────────────────────────────────────────────────

  const stressed = diffs.filter(d => d.verdict === 'stressed')
  if (stressed.length > 0) {
    emit()
    emit(`### ⚠️ Stressed (${stressed.length})`)
    emit()
    emit('| Function | Location | Signals |')
    emit('|---|---|---|')
    for (const d of stressed.slice(0, 10)) {
      const signals = d.signals.join(' · ')
      emit(`| \`${d.name}\` | \`${d.relPath}\` | ${signals} |`)
    }
    if (stressed.length > 10) emit(`\n*…and ${stressed.length - 10} more*`)
  }

  // ── New Bridges ───────────────────────────────────────────────────────────

  if (newBridges.length > 0) {
    emit()
    emit(`### 🌉 New Bridges (${newBridges.length})`)
    emit()
    emit('> Functions that became the primary or sole connection between two module clusters.')
    emit('> Removing or breaking them could silently sever those modules.')
    emit()
    emit('| Function | Location | Connects |')
    emit('|---|---|---|')
    for (const d of newBridges) {
      const bridgeSignals = d.signals
        .filter(s => s.includes('→') || s.includes('link'))
        .slice(0, 2)
        .join('; ')
      emit(`| \`${d.name}\` | \`${d.relPath}\` | ${bridgeSignals || 'see signals'} |`)
    }
  }

  // ── Watched archetype gains (excluding bridges, already shown above) ───────

  const otherWatched = watchedGains.filter(d => !d.archetypesGained.includes('The Bridge'))
  if (otherWatched.length > 0) {
    emit()
    emit(`### 👀 Watched Archetypes Gained`)
    emit()
    emit('| Function | Location | Gained |')
    emit('|---|---|---|')
    for (const d of otherWatched.slice(0, 8)) {
      emit(`| \`${d.name}\` | \`${d.relPath}\` | ${d.archetypesGained.join(', ')} |`)
    }
  }

  // ── Collapsible: improvements + new notable ───────────────────────────────

  const improved  = diffs.filter(d => d.verdict === 'improved')
  const newNotable = diffs.filter(d => d.verdict === 'new' && d.archetypesGained.length > 0)

  if (improved.length > 0 || newNotable.length > 0) {
    emit()
    const detailParts = []
    if (improved.length  > 0) detailParts.push(`✅ ${improved.length} improved`)
    if (newNotable.length > 0) detailParts.push(`🆕 ${newNotable.length} new with archetypes`)
    emit(`<details>`)
    emit(`<summary>${detailParts.join(' · ')}</summary>`)
    emit()

    if (improved.length > 0) {
      emit('**Improved:**')
      for (const d of improved.slice(0, 8)) {
        emit(`- \`${d.name}\` (\`${d.relPath}\`) — ${d.signals.join(', ')}`)
      }
    }

    if (newNotable.length > 0) {
      if (improved.length > 0) emit()
      emit('**New with archetypes:**')
      for (const d of newNotable.slice(0, 8)) {
        emit(`- \`${d.name}\` (\`${d.relPath}\`) — ${d.archetypesGained.join(', ')}`)
      }
    }

    emit()
    emit('</details>')
  }

  // ── Footer ────────────────────────────────────────────────────────────────

  emit()
  emit('---')
  emit('*[Sociograph](https://github.com/mcm/sociograph) · run locally: `sociograph diff ' +
       `${short(beforeRef)}..${short(afterRef)}\`*`)

  return lines.join('\n')
}
