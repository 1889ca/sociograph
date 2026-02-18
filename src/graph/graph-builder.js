/**
 * Graph Builder — orchestrates file parsing and call resolution.
 *
 * 1. Discovers all JS/TS files in the target directory
 * 2. Parses each file (functions + raw calls + import maps)
 * 3. Resolves raw call names to function IDs
 * 4. Populates and returns a CallGraph
 */

import { glob } from 'glob'
import { Worker } from 'worker_threads'
import { cpus } from 'os'
import { relative } from 'path'
import { CallGraph } from './call-graph.js'
import { walkFile } from '../parsers/ast-walker.js'

const FILE_PATTERN = '**/*.{js,jsx,ts,tsx,mjs,cjs}'

// Names that shadow native JS/DOM/Node methods — never resolve via global-name
// fallback because calls are virtually always to the built-in, not a user function.
const NATIVE_METHOD_NAMES = new Set([
  // Array
  'map', 'filter', 'reduce', 'reduceRight', 'forEach', 'find', 'findIndex',
  'findLast', 'findLastIndex', 'some', 'every', 'flat', 'flatMap',
  'push', 'pop', 'shift', 'unshift', 'splice', 'slice', 'concat',
  'join', 'reverse', 'sort', 'fill', 'copyWithin', 'includes', 'indexOf',
  'lastIndexOf', 'entries', 'keys', 'values', 'at',
  // Object
  'assign', 'keys', 'values', 'entries', 'create', 'freeze', 'seal',
  'fromEntries', 'getOwnPropertyNames', 'defineProperty', 'hasOwn',
  // String
  'split', 'match', 'matchAll', 'replace', 'replaceAll', 'search',
  'trim', 'trimStart', 'trimEnd', 'padStart', 'padEnd',
  'startsWith', 'endsWith', 'includes', 'indexOf', 'lastIndexOf',
  'slice', 'substring', 'charAt', 'charCodeAt', 'toLowerCase', 'toUpperCase',
  'repeat', 'normalize',
  // Promise / async
  'then', 'catch', 'finally', 'resolve', 'reject', 'all', 'allSettled',
  'race', 'any',
  // Math
  'round', 'floor', 'ceil', 'abs', 'min', 'max', 'pow', 'sqrt', 'random',
  'sign', 'trunc', 'log', 'log2', 'log10',
  // JSON / Date / general built-ins
  'parse', 'stringify', 'toString', 'valueOf', 'toJSON', 'toISOString',
  'toLocaleDateString', 'toLocaleString', 'getTime', 'getDate', 'getDay',
  'getMonth', 'getFullYear', 'getHours', 'getMinutes', 'getSeconds',
  'setDate', 'setMonth', 'setFullYear',
  // EventEmitter / Node
  'emit', 'on', 'off', 'once', 'removeListener', 'removeAllListeners',
  'addListener', 'prependListener',
  // Generic method names too short/common to trust
  'get', 'set', 'has', 'add', 'delete', 'clear', 'size',
  'call', 'apply', 'bind',
  'error', 'warn', 'info', 'debug', 'log',
  'send', 'write', 'read', 'end', 'close', 'open', 'destroy',
  'next', 'done', 'return', 'throw',
  'test', 'exec', 'compile',
])
const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/coverage/**',
  '**/*.test.*',
  '**/*.spec.*',
  '**/*.d.ts',
]

/**
 * Build a CallGraph from a project directory.
 *
 * @param {string} rootDir  Absolute path to project root
 * @param {{ verbose?: boolean }} options
 * @returns {Promise<CallGraph>}
 */
export async function buildGraph(rootDir, options = {}) {
  const { verbose = false } = options

  // 1. Discover files
  const files = await glob(FILE_PATTERN, {
    cwd: rootDir,
    absolute: true,
    ignore: IGNORE_PATTERNS,
  })

  if (verbose) console.error(`  Discovered ${files.length} files`)

  const graph = new CallGraph()

  // Per-file data, keyed by absolute path
  const fileData = new Map()

  // 2. Parse all files (parallel when large enough to justify worker overhead)
  const parsed = await parseFiles(files, rootDir, verbose)

  for (const [file, { functions, calls, importMap }] of parsed) {
    for (const fn of functions) {
      graph.addFunction(fn)
    }
    fileData.set(file, { functions, calls, importMap })
  }

  if (verbose) console.error(`  Parsed ${graph.nodes.size} functions`)

  // 3. Build resolution indices
  // name -> [functionId] (may be multiple if same name in different files)
  const nameIndex = buildNameIndex(graph)
  // "resolvedFile::exportedName" -> functionId
  const exportIndex = buildExportIndex(graph)

  // 4. Resolve calls and add edges
  let resolved = 0
  let unresolved = 0

  for (const [file, { calls, importMap }] of fileData) {
    for (const rawCall of calls) {
      const edge = resolveCall(rawCall, importMap, nameIndex, exportIndex, graph, rootDir)
      graph.addEdge(edge)
      if (edge.resolved) resolved++
      else unresolved++
    }
  }

  if (verbose) {
    console.error(`  Resolved ${resolved} calls, ${unresolved} external/unresolved`)
  }

  return graph
}

// --- Resolution ---

function resolveCall(rawCall, importMap, nameIndex, exportIndex, graph, rootDir) {
  const { from, calleeName, calleeObject, file, line } = rawCall

  const callerNode = graph.getNode(from)
  const callerModule = callerNode?.module ?? null

  // Strategy 1: calleeName is a locally-imported name
  const importEntry = importMap.get(calleeName)
  if (importEntry && !importEntry.isNamespace) {
    const key = `${relative(rootDir, importEntry.resolvedFile)}::${importEntry.exportedName}`
    const targetId = exportIndex.get(key)
    if (targetId) {
      const targetNode = graph.getNode(targetId)
      return makeEdge(from, targetId, calleeName, true, callerModule !== targetNode?.module, file, line)
    }
  }

  // Strategy 2: namespace import — foo.bar() where foo is a namespace import
  if (calleeObject) {
    const nsEntry = importMap.get(calleeObject)
    if (nsEntry?.isNamespace) {
      const key = `${relative(rootDir, nsEntry.resolvedFile)}::${calleeName}`
      const targetId = exportIndex.get(key)
      if (targetId) {
        const targetNode = graph.getNode(targetId)
        return makeEdge(from, targetId, calleeName, true, callerModule !== targetNode?.module, file, line)
      }
    }
  }

  // Strategy 3: name match within same file (local function call)
  const callerFile = graph.getNode(from)?.relPath
  const sameFileCandidates = (nameIndex.get(calleeName) ?? []).filter(id => {
    return graph.getNode(id)?.relPath === callerFile
  })
  if (sameFileCandidates.length === 1) {
    return makeEdge(from, sameFileCandidates[0], calleeName, true, false, file, line)
  }

  // Strategy 4: unique name match across the whole project
  // Skip names that shadow native JS methods — calls to e.g. `.map()` are
  // overwhelmingly array/string built-ins, not a user-defined `map` function.
  const allCandidates = nameIndex.get(calleeName) ?? []
  if (allCandidates.length === 1 && !NATIVE_METHOD_NAMES.has(calleeName)) {
    const targetNode = graph.getNode(allCandidates[0])
    return makeEdge(from, allCandidates[0], calleeName, true, callerModule !== targetNode?.module, file, line)
  }

  // Unresolved — probably an external library call or a built-in
  return makeEdge(from, null, calleeName, false, false, file, line)
}

function makeEdge(from, to, calleeName, resolved, crossModule, file, line) {
  return { from, to, calleeName, resolved, crossModule, file, line }
}

// --- Index builders ---

function buildNameIndex(graph) {
  const index = new Map()
  for (const node of graph.getAllNodes()) {
    if (!index.has(node.name)) index.set(node.name, [])
    index.get(node.name).push(node.id)
  }
  return index
}

// --- File parsing (serial or parallel) ---

const WORKER_URL        = new URL('../parsers/ast-worker.js', import.meta.url)
// SG_NO_WORKERS disables the thread pool (e.g. when running as a bundled CI action)
const PARALLEL_THRESHOLD = process.env.SG_NO_WORKERS ? Infinity : 150
const MAX_WORKERS        = Math.min(cpus().length, 8)

/**
 * Parse all files, using a worker-thread pool when there are enough files
 * to justify the overhead of spawning workers.
 *
 * @returns {Map<string, { functions, calls, importMap }>}
 */
async function parseFiles(files, rootDir, verbose) {
  if (files.length < PARALLEL_THRESHOLD) {
    const result = new Map()
    for (const file of files) result.set(file, walkFile(file, rootDir))
    return result
  }

  const concurrency = Math.min(MAX_WORKERS, files.length)
  if (verbose) console.error(`  Parsing with ${concurrency} workers...`)

  return new Promise((resolve, reject) => {
    const result   = new Map()
    const queue    = [...files]
    let active     = 0
    let settled    = false

    const done = () => {
      if (!settled && active === 0) { settled = true; resolve(result) }
    }

    const spawnWorker = () => {
      const w = new Worker(WORKER_URL, { workerData: { rootDir } })
      active++

      const next = () => {
        const file = queue.shift()
        if (file) {
          w.postMessage(file)
        } else {
          w.terminate()
          active--
          done()
        }
      }

      w.on('message', ({ filePath, functions, calls, importMap }) => {
        result.set(filePath, { functions, calls, importMap })
        next()
      })

      w.on('error', (err) => {
        active--
        if (!settled) { settled = true; reject(err) }
      })

      next()
    }

    for (let i = 0; i < concurrency; i++) spawnWorker()
  })
}

function buildExportIndex(graph) {
  // Maps "relPath::name" -> nodeId
  // This is a simplification — we treat all named functions as "exported"
  // for resolution purposes (it's the responsibility graph, not the public API)
  const index = new Map()
  for (const node of graph.getAllNodes()) {
    index.set(`${node.relPath}::${node.name}`, node.id)
    // Also index by default export heuristic (one function per file named same as file)
    index.set(`${node.relPath}::default`, node.id)
  }
  return index
}
