#!/usr/bin/env node

import { resolve, relative } from 'path'
import { buildGraph } from './graph/graph-builder.js'
import { classify } from './analyzers/classifier.js'
import { report } from './reporters/terminal.js'

const args = process.argv.slice(2)
const target = args[0] ?? '.'
const verbose = args.includes('--verbose') || args.includes('-v')

const rootDir = resolve(target)
const displayPath = relative(process.cwd(), rootDir) || '.'

if (verbose) process.stderr.write(`\nAnalyzing ${rootDir}...\n`)

const graph = await buildGraph(rootDir, { verbose })
const classifications = classify(graph)
const output = report(graph, classifications, { path: displayPath })

process.stdout.write(output + '\n')
