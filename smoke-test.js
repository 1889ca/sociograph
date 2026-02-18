import { buildGraph } from './src/graph/graph-builder.js'
import { resolve } from 'path'

const rootDir = resolve('./test-fixture')
const graph = await buildGraph(rootDir, { verbose: true })

console.log('\n--- FUNCTIONS ---')
for (const fn of graph.getAllNodes()) {
  console.log(`  ${fn.id}`)
  console.log(`    kind=${fn.kind} params=${fn.params} complexity=${fn.complexity} loc=${fn.linesOfCode}`)
  console.log(`    fan-in=${graph.fanIn(fn.id)} fan-out=${graph.fanOut(fn.id)} cross-module=${graph.crossModuleFanOut(fn.id)}`)
}

console.log('\n--- EDGES ---')
for (const edge of graph.edges) {
  const status = edge.resolved ? `-> ${edge.to}` : `-> [external: ${edge.calleeName}]`
  console.log(`  ${edge.from} ${status}  (line ${edge.line})`)
}

console.log('\n--- SUMMARY ---')
console.log(graph.summary())
