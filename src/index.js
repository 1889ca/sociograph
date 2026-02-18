#!/usr/bin/env node

import { resolve, relative } from 'path'
import { writeFileSync } from 'fs'
import { buildGraph } from './graph/graph-builder.js'
import { classify } from './analyzers/classifier.js'
import { analyzeGit } from './git/git-analyzer.js'
import { report as terminalReport } from './reporters/terminal.js'
import { report as webReport } from './reporters/web.js'

const args = process.argv.slice(2)
const subcommand = args[0]

// ── diff subcommand ─────────────────────────────────────────────────────────
if (subcommand === 'diff') {
  const range   = args[1]
  const verbose = args.includes('--verbose') || args.includes('-v')
  const target  = args.find((a, i) => i > 1 && !a.startsWith('-')) ?? '.'
  const rootDir = resolve(target)

  if (!range || !range.includes('..')) {
    process.stderr.write('Usage: sociograph diff <before>..<after> [path] [--verbose]\n')
    process.exit(1)
  }

  const { runDiff }       = await import('./diff/diff-runner.js')
  const { report: diffReport } = await import('./reporters/diff-terminal.js')
  const result = await runDiff(rootDir, range, { verbose })
  process.stdout.write(diffReport(result, { verbose }) + '\n')
  process.exit(0)
}

// ── default: analyze subcommand ─────────────────────────────────────────────
const target   = args.find(a => !a.startsWith('-')) ?? '.'
const verbose  = args.includes('--verbose') || args.includes('-v')
const noGit    = args.includes('--no-git')
const topArg   = args.find(a => a.startsWith('--top='))
const limitArg = args.find(a => a.startsWith('--git-limit='))
const webArg   = args.find(a => a === '--web' || a.startsWith('--web='))
const top      = topArg   ? parseInt(topArg.split('=')[1], 10)   : undefined
const gitLimit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 500

// --web or --web=output.html
const webMode = webArg !== undefined
const webOut  = webArg?.includes('=') ? webArg.split('=').slice(1).join('=') : 'sociograph.html'

const rootDir = resolve(target)
const displayPath = relative(process.cwd(), rootDir) || '.'

if (verbose) process.stderr.write(`\nAnalyzing ${rootDir}...\n`)

const graph = await buildGraph(rootDir, { verbose })

let gitMetrics = null
if (!noGit) {
  gitMetrics = await analyzeGit(rootDir, graph, { limit: gitLimit, verbose })
}

const classifications = classify(graph, { gitMetrics })

if (webMode) {
  const html = await webReport(graph, classifications, { path: displayPath, gitMetrics })
  writeFileSync(webOut, html, 'utf8')
  process.stderr.write(`Web graph written to ${webOut}\n`)
} else {
  const output = terminalReport(graph, classifications, { path: displayPath, top })
  process.stdout.write(output + '\n')
}
