import { buildGraph } from './src/graph/graph-builder.js'
import { classify, archetypeCounts } from './src/analyzers/classifier.js'
import { resolve } from 'path'

const rootDir = resolve('./test-fixture')
const graph = await buildGraph(rootDir, { verbose: true })
const classifications = classify(graph)

console.log('\n=== ARCHETYPE CENSUS ===')
const counts = archetypeCounts(classifications)
for (const [label, count] of [...counts.entries()].sort((a,b) => b[1]-a[1])) {
  console.log(`  ${count}x ${label}`)
}

console.log('\n=== ALL CLASSIFIED FUNCTIONS ===')
for (const [nodeId, matches] of classifications) {
  if (matches.length === 0) continue
  const node = graph.getNode(nodeId)
  const top = matches[0]
  console.log(`\n  ${top.emoji} ${top.label} (${Math.round(top.confidence * 100)}%) — ${nodeId}`)
  for (const reason of top.reasons) {
    console.log(`     • ${reason}`)
  }
  if (matches.length > 1) {
    const also = matches.slice(1).map(m => `${m.emoji}${m.label}`).join(', ')
    console.log(`     also: ${also}`)
  }
  console.log(`     metrics: fan-in=${graph.fanIn(nodeId)} fan-out=${graph.fanOut(nodeId)} complexity=${node.complexity} params=${node.params}`)
}

console.log('\n=== NORMAL (no archetype) ===')
for (const [nodeId, matches] of classifications) {
  if (matches.length === 0) {
    const node = graph.getNode(nodeId)
    console.log(`  ${nodeId}  (complexity=${node.complexity} fi=${graph.fanIn(nodeId)} fo=${graph.fanOut(nodeId)})`)
  }
}
