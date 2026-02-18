/**
 * CallGraph — the social network of a codebase.
 *
 * Nodes are functions. Edges are calls between them.
 * Provides the raw metrics that archetypes are built from.
 */

export class CallGraph {
  /** @type {Map<string, FunctionNode>} */
  nodes = new Map()

  /** @type {CallEdge[]} */
  edges = []

  // Cached derived structures, invalidated on mutation
  #callerIndex = null
  #calleeIndex = null

  addFunction(node) {
    this.nodes.set(node.id, node)
    this.#callerIndex = null
    this.#calleeIndex = null
  }

  addEdge(edge) {
    this.edges.push(edge)
    this.#callerIndex = null
    this.#calleeIndex = null
  }

  // --- Accessors ---

  getNode(id) {
    return this.nodes.get(id)
  }

  getAllNodes() {
    return [...this.nodes.values()]
  }

  // Who calls this function? (fan-in)
  callers(nodeId) {
    this.#buildIndices()
    return this.#callerIndex.get(nodeId) ?? []
  }

  // Who does this function call? (fan-out)
  callees(nodeId) {
    this.#buildIndices()
    return this.#calleeIndex.get(nodeId) ?? []
  }

  fanIn(nodeId) {
    return this.callers(nodeId).length
  }

  fanOut(nodeId) {
    return this.callees(nodeId).length
  }

  // How many of this function's calls cross module boundaries?
  crossModuleFanOut(nodeId) {
    const node = this.nodes.get(nodeId)
    if (!node) return 0
    return this.callees(nodeId).filter(edge => {
      const target = this.nodes.get(edge.to)
      return target && target.module !== node.module
    }).length
  }

  // All edges involving this node
  edgesFor(nodeId) {
    return this.edges.filter(e => e.from === nodeId || e.to === nodeId)
  }

  // Stats summary
  summary() {
    return {
      functions: this.nodes.size,
      calls: this.edges.length,
      resolved: this.edges.filter(e => e.resolved).length,
      crossModule: this.edges.filter(e => e.crossModule).length,
      external: this.edges.filter(e => !e.resolved).length,
    }
  }

  #buildIndices() {
    if (this.#callerIndex) return

    this.#callerIndex = new Map()
    this.#calleeIndex = new Map()

    for (const edge of this.edges) {
      if (!this.#calleeIndex.has(edge.from)) this.#calleeIndex.set(edge.from, [])
      this.#calleeIndex.get(edge.from).push(edge)

      if (!this.#callerIndex.has(edge.to)) this.#callerIndex.set(edge.to, [])
      this.#callerIndex.get(edge.to).push(edge)
    }
  }
}

/**
 * @typedef {Object} FunctionNode
 * @property {string} id          - Unique: "path/to/file.ts::functionName"
 * @property {string} name        - Function name (or "<anonymous>")
 * @property {string} file        - Absolute file path
 * @property {string} module      - Module name (top-level dir or file stem)
 * @property {number} line        - Start line
 * @property {number} endLine     - End line
 * @property {number} params      - Parameter count
 * @property {number} complexity  - Cyclomatic complexity
 * @property {number} linesOfCode - Logical LOC (end - start)
 * @property {string} kind        - "function" | "method" | "arrow" | "anonymous"
 * @property {string|null} className - If a class method, the class name
 */

/**
 * @typedef {Object} CallEdge
 * @property {string} from       - Caller function ID
 * @property {string} to         - Callee function ID (if resolved)
 * @property {string} calleeName - Raw name as written in source
 * @property {boolean} resolved  - Whether 'to' was successfully resolved
 * @property {boolean} crossModule
 * @property {string} file       - File where the call occurs
 * @property {number} line       - Line of the call
 */
