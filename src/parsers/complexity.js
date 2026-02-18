/**
 * Cyclomatic complexity calculator.
 * Counts decision points within a function's AST node.
 *
 * Each of these adds 1 to the base complexity of 1:
 *   if / else if / ternary / ?? / && / || / case / catch / loops
 */

const BRANCH_TYPES = new Set([
  'IfStatement',
  'ConditionalExpression',     // ternary
  'SwitchCase',
  'CatchClause',
  'WhileStatement',
  'DoWhileStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
])

const LOGICAL_OPERATORS = new Set(['&&', '||', '??'])

export function computeComplexity(funcNode) {
  let score = 1
  walk(funcNode.body ?? funcNode, score, (delta) => { score += delta })
  return score
}

function walk(node, _, increment) {
  if (!node || typeof node !== 'object') return

  if (BRANCH_TYPES.has(node.type)) {
    increment(1)
  }

  if (node.type === 'LogicalExpression' && LOGICAL_OPERATORS.has(node.operator)) {
    increment(1)
  }

  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'loc' || key === 'range' || key === 'parent') continue
    const child = node[key]
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && item.type) walk(item, _, increment)
      }
    } else if (child && typeof child === 'object' && child.type) {
      // Don't descend into nested function bodies — they have their own complexity
      if (
        child.type === 'FunctionExpression' ||
        child.type === 'ArrowFunctionExpression' ||
        child.type === 'FunctionDeclaration'
      ) continue
      walk(child, _, increment)
    }
  }
}
