/**
 * AST Walker — extracts functions and calls from a single JS/TS file.
 *
 * Returns:
 *   { functions: FunctionNode[], calls: RawCall[], importMap: Map }
 *
 * A RawCall has a calleeName but no resolved target yet — resolution
 * happens in the graph builder after all files are parsed.
 */

import { parse } from '@typescript-eslint/typescript-estree'
import { readFileSync } from 'fs'
import { relative, basename, dirname } from 'path'
import { computeComplexity } from './complexity.js'
import { buildImportMap } from './import-resolver.js'

const PARSE_OPTIONS = {
  jsx: true,
  loc: true,
  range: true,
  comment: false,
  tokens: false,
  errorRecovery: true,
}

/**
 * Walk a single file and extract its social data.
 *
 * @param {string} filePath  Absolute path to the file
 * @param {string} rootDir   Project root (for relative IDs)
 * @returns {{ functions: FunctionNode[], calls: RawCall[], importMap: Map }}
 */
export function walkFile(filePath, rootDir) {
  const source = readFileSync(filePath, 'utf8')
  let ast

  try {
    ast = parse(source, PARSE_OPTIONS)
  } catch {
    // Unparseable file — skip gracefully
    return { functions: [], calls: [], importMap: new Map() }
  }

  const importMap = buildImportMap(ast, filePath)
  const relPath = relative(rootDir, filePath)
  const module = inferModule(relPath)

  // Pre-build name hints so anonymous functions get real names during the walk
  const nameHints = new Map()
  walkForNameHints(ast, nameHints)

  const functions = []
  const calls = []

  // Stack of currently-open function IDs as we traverse nested scopes
  const scopeStack = []

  walkNode(ast, {
    filePath,
    relPath,
    module,
    rootDir,
    scopeStack,
    functions,
    calls,
    nameHints,
  })

  return { functions, calls, importMap }
}

// --- Node visitor ---

function walkNode(node, ctx) {
  if (!node || typeof node !== 'object') return

  const isFuncNode = isFunctionNode(node)

  if (isFuncNode) {
    const fn = extractFunction(node, ctx)
    ctx.functions.push(fn)
    ctx.scopeStack.push(fn.id)

    // Walk children within this scope
    walkChildren(node, ctx)

    ctx.scopeStack.pop()
    return  // Children already walked above
  }

  if (node.type === 'CallExpression') {
    const calleeName = extractCalleeName(node.callee)
    if (calleeName && ctx.scopeStack.length > 0) {
      ctx.calls.push({
        from: ctx.scopeStack[ctx.scopeStack.length - 1],
        calleeName,
        calleeObject: extractCalleeObject(node.callee),
        file: ctx.filePath,
        line: node.loc?.start.line ?? 0,
      })
    }
  }

  walkChildren(node, ctx)
}

function walkChildren(node, ctx) {
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue
    const child = node[key]
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && item.type) walkNode(item, ctx)
      }
    } else if (child && typeof child === 'object' && child.type) {
      walkNode(child, ctx)
    }
  }
}

const SKIP_KEYS = new Set(['type', 'loc', 'range', 'parent', 'tokens', 'comments'])

// --- Function extraction ---

function isFunctionNode(node) {
  return (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
  )
}

function extractFunction(node, ctx) {
  const name = resolveFunctionName(node, ctx)
  const className = resolveClassName(node)
  const kind = resolveKind(node)
  const id = `${ctx.relPath}::${name}`

  return {
    id,
    name,
    file: ctx.filePath,
    relPath: ctx.relPath,
    module: ctx.module,
    line: node.loc?.start.line ?? 0,
    endLine: node.loc?.end.line ?? 0,
    params: node.params?.length ?? 0,
    complexity: computeComplexity(node),
    linesOfCode: (node.loc?.end.line ?? 0) - (node.loc?.start.line ?? 0) + 1,
    kind,
    className,
  }
}

function resolveFunctionName(node, ctx) {
  // FunctionDeclaration: function foo() {}
  if (node.id?.name) return node.id.name

  // Use the pre-built name hints (const foo = () => {}, class methods, etc.)
  const line = node.loc?.start.line
  if (line && ctx.nameHints?.has(line)) return ctx.nameHints.get(line)

  return `<anonymous#${ctx.functions.length}>`
}

/**
 * Post-process: after building the full context, we re-assign names
 * to anonymous functions from their assignment context.
 * This is called from the graph builder on the raw walkFile result.
 */
export function refineAnonymousNames(functions, rawCalls, ast) {
  // Build a map: loc.start.line -> inferred name from assignment
  const nameHints = new Map()

  walkForNameHints(ast, nameHints)

  for (const fn of functions) {
    if (fn.name.startsWith('<anonymous')) {
      const hint = nameHints.get(fn.line)
      if (hint) fn.name = hint
    }
  }
}

function walkForNameHints(node, hints) {
  if (!node || typeof node !== 'object') return

  // const foo = () => {} or const foo = function() {}
  if (
    node.type === 'VariableDeclarator' &&
    node.id?.type === 'Identifier' &&
    node.init &&
    isFunctionNode(node.init)
  ) {
    hints.set(node.init.loc?.start.line, node.id.name)
  }

  // foo: () => {} (object property)
  if (
    node.type === 'Property' &&
    node.key?.type === 'Identifier' &&
    isFunctionNode(node.value)
  ) {
    hints.set(node.value.loc?.start.line, node.key.name)
  }

  // class method: foo() {}
  if (
    node.type === 'MethodDefinition' &&
    node.key?.type === 'Identifier' &&
    node.value &&
    isFunctionNode(node.value)
  ) {
    hints.set(node.value.loc?.start.line, node.key.name)
  }

  // foo.bar = () => {} (assignment)
  if (
    node.type === 'AssignmentExpression' &&
    node.right &&
    isFunctionNode(node.right)
  ) {
    const name = extractCalleeName(node.left)
    if (name) hints.set(node.right.loc?.start.line, name)
  }

  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue
    const child = node[key]
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && item.type) walkForNameHints(item, hints)
      }
    } else if (child && typeof child === 'object' && child.type) {
      walkForNameHints(child, hints)
    }
  }
}

function resolveClassName(node) {
  // This would need parent tracking — skip for now, left as extension point
  return null
}

function resolveKind(node) {
  if (node.type === 'ArrowFunctionExpression') return 'arrow'
  if (node.type === 'FunctionDeclaration') return 'function'
  if (node.type === 'FunctionExpression') return 'function'
  return 'function'
}

// --- Call extraction ---

function extractCalleeName(callee) {
  if (!callee) return null
  if (callee.type === 'Identifier') return callee.name
  if (callee.type === 'MemberExpression') {
    // foo.bar() — return 'bar'
    if (callee.property?.type === 'Identifier') return callee.property.name
  }
  return null
}

function extractCalleeObject(callee) {
  if (!callee) return null
  if (callee.type === 'MemberExpression') {
    if (callee.object?.type === 'Identifier') return callee.object.name
    if (callee.object?.type === 'ThisExpression') return 'this'
  }
  return null
}

// --- Utilities ---

/**
 * Infer a module name from a relative file path.
 * "src/api/handlers/user.ts" -> "api"
 * "utils/format.js" -> "utils"
 */
function inferModule(relPath) {
  const parts = relPath.split('/')
  // Skip 'src', 'lib', 'app' as top-level — go one deeper
  const skip = new Set(['src', 'lib', 'app', 'source'])
  for (const part of parts) {
    if (!skip.has(part)) {
      // Strip extension from final part
      return part.replace(/\.[^.]+$/, '')
    }
  }
  return basename(relPath).replace(/\.[^.]+$/, '')
}
