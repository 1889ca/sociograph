/**
 * Resolves import specifiers to absolute file paths.
 *
 * Handles:
 *   - Relative paths: './foo', '../bar/baz'
 *   - Extension inference: .js, .ts, .jsx, .tsx, /index variants
 *   - Named + default imports
 *
 * Does NOT handle node_modules — external imports are marked as unresolvable.
 */

import { existsSync } from 'fs'
import { resolve, dirname, join } from 'path'

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']

/**
 * Given a file and an import specifier, return the absolute path of the
 * imported file (or null if it's external/unresolvable).
 */
export function resolveImportPath(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null  // external module

  const dir = dirname(fromFile)
  const base = resolve(dir, specifier)

  // Try exact path first
  if (existsSync(base)) return base

  // Try adding extensions
  for (const ext of EXTENSIONS) {
    const candidate = base + ext
    if (existsSync(candidate)) return candidate
  }

  // Try /index variants
  for (const ext of EXTENSIONS) {
    const candidate = join(base, `index${ext}`)
    if (existsSync(candidate)) return candidate
  }

  return null
}

/**
 * Parse the import declarations from an AST and return a map of:
 *   localName -> { resolvedFile, exportedName }
 *
 * This lets us trace: if we see a call to `localName()`, we know it came
 * from `resolvedFile` and was exported as `exportedName`.
 */
export function buildImportMap(ast, fromFile) {
  const map = new Map()

  for (const node of ast.body ?? []) {
    if (node.type === 'ImportDeclaration') {
      const resolvedFile = resolveImportPath(fromFile, node.source.value)
      if (!resolvedFile) continue

      for (const specifier of node.specifiers) {
        if (specifier.type === 'ImportSpecifier') {
          // import { foo as bar } — localName=bar, exportedName=foo
          map.set(specifier.local.name, {
            resolvedFile,
            exportedName: specifier.imported.name,
          })
        } else if (specifier.type === 'ImportDefaultSpecifier') {
          // import Foo from './foo' — localName=Foo, exportedName=default
          map.set(specifier.local.name, {
            resolvedFile,
            exportedName: 'default',
          })
        } else if (specifier.type === 'ImportNamespaceSpecifier') {
          // import * as foo from './foo' — track namespace
          map.set(specifier.local.name, {
            resolvedFile,
            exportedName: '*',
            isNamespace: true,
          })
        }
      }
    }

    // CommonJS: const { foo } = require('./bar')
    if (
      node.type === 'VariableDeclaration' &&
      node.declarations?.[0]?.init?.type === 'CallExpression' &&
      node.declarations[0].init.callee?.name === 'require'
    ) {
      const arg = node.declarations[0].init.arguments?.[0]
      if (arg?.type !== 'Literal') continue
      const resolvedFile = resolveImportPath(fromFile, arg.value)
      if (!resolvedFile) continue

      const decl = node.declarations[0]
      if (decl.id.type === 'ObjectPattern') {
        for (const prop of decl.id.properties) {
          map.set(prop.value?.name ?? prop.key?.name, {
            resolvedFile,
            exportedName: prop.key?.name,
          })
        }
      } else if (decl.id.type === 'Identifier') {
        map.set(decl.id.name, {
          resolvedFile,
          exportedName: '*',
          isNamespace: true,
        })
      }
    }
  }

  return map
}
