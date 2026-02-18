#!/usr/bin/env node

import { resolve, relative } from 'path'
import { buildGraph } from './graph/graph-builder.js'
import { classify } from './analyzers/classifier.js'
import { analyzeGit } from './git/git-analyzer.js'
import { report } from './reporters/terminal.js'

const args = process.argv.slice(2)
const target = args.find(a => !a.startsWith('-')) ?? '.'
const verbose  = args.includes('--verbose') || args.includes('-v')
const noGit    = args.includes('--no-git')
const topArg   = args.find(a => a.startsWith('--top='))
const limitArg = args.find(a => a.startsWith('--git-limit='))
const top      = topArg   ? parseInt(topArg.split('=')[1], 10)   : undefined
const gitLimit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 500

const rootDir = resolve(target)
const displayPath = relative(process.cwd(), rootDir) || '.'

if (verbose) process.stderr.write(`\nAnalyzing ${rootDir}...\n`)

const graph = await buildGraph(rootDir, { verbose })

let gitMetrics = null
if (!noGit) {
  gitMetrics = await analyzeGit(rootDir, graph, { limit: gitLimit, verbose })
}

const classifications = classify(graph, { gitMetrics })
const output = report(graph, classifications, { path: displayPath, top })

process.stdout.write(output + '\n')
