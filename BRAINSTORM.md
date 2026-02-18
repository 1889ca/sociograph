# sociograph — a sociologist's debugger

> Most debuggers trace *execution*. This one traces *responsibility*.

The core insight: a codebase is a society. Functions have roles, relationships,
power dynamics, and stress fractures. When something goes wrong — when a codebase
becomes painful to work in — the root cause is almost always *social*, not just
algorithmic. God objects. Codependencies. Overloaded workers. Strangers in the
wrong module. Sociograph surfaces these.

---

## The Core Metaphors

These are the "character types" we'd detect:

| Archetype       | What it means                                                          | Signals                                                   |
|-----------------|------------------------------------------------------------------------|-----------------------------------------------------------|
| **The Boss**    | Everything depends on it. Single point of failure.                     | Very high fan-in, low fan-out                             |
| **The Workhorse**| Does too much. Modified constantly. Carries the codebase on its back. | High complexity + high fan-out + frequent commits         |
| **The Gossip**  | Calls into many unrelated modules. Spreads coupling.                   | High cross-module fan-out                                 |
| **The Hermit**  | Nobody calls it. Isolated. May be dead code or a hidden gem.           | Very low fan-in                                           |
| **The Stranger**| Lives in the wrong module. Its relationships are all *elsewhere*.      | Most of its calls cross module boundaries                 |
| **The Ghost**   | Still around but barely used. Not dead, just forgotten.                | Low call frequency (from git/usage analysis)              |
| **The Codependent**| Always changes with another function. Inseparable in git history.   | High co-commit correlation with a sibling                 |
| **The Crisis Point**| Touched in every bug fix. Where fires start.                      | Disproportionate presence in fix/hotfix commits           |
| **The Overloaded**| Too many parameters. Too many responsibilities. Needs therapy.       | High param count + high complexity + high fan-out         |

---

## What We Actually Analyze

### Static Analysis (AST)
- **Call graph**: who calls who, cross-module vs intra-module
- **Fan-in / fan-out** per function
- **Cyclomatic complexity** (branches, conditions)
- **Parameter count** and types (if typed)
- **Lines of code** per function
- **Module membership** — does this function "belong" here?

### Dynamic / Historical Analysis (Git)
- **Co-commit frequency**: which functions change together?
- **Commit message sentiment**: how many of a function's touches are bug fixes vs features?
- **Churn rate**: how often is a function modified over time?
- **Author count**: how many people have touched this? (high = either central or chaotic)
- **Age vs modification rate**: old code that's still changing is stressed

### Relationship Topology
- Build a force-directed social graph
- Edge weights = relationship strength (call frequency, co-commit rate)
- Cluster detection: identify "cliques" (tightly coupled groups)
- Bridge detection: functions that connect otherwise isolated clusters (fragile linchpins)

---

## Output Modes

### 1. Terminal Report (MVP)
```
sociograph analyze ./src

  THE SOCIETY OF src/
  ───────────────────────────────────────
  👔 THE BOSS        processRequest()     — 47 dependents, touched by 12 authors
  😰 THE WORKHORSE   handleUserAuth()     — complexity 34, modified 89 times
  👻 THE GOSSIP      utils/format.js      — calls into 11 different modules
  🔥 CRISIS POINT    api/middleware.js:82 — in 23 of 31 hotfix commits
  💀 HERMITS (4)     oldParser, legacyV1... (dead code candidates)
  🤝 CODEPENDENTS    validateForm() ↔ sanitizeInput() — always travel together
```

### 2. Interactive Web Graph
- Force-directed D3 graph
- Click a node to see its full "social profile"
- Filter by archetype
- Zoom into modules or zoom out to the whole society

### 3. Diff Mode (CI integration)
```
sociograph diff main..feature/auth

  ⚠️  handleUserAuth() stress increased: complexity +8, fan-out +3
  ✅  utils/format.js gossip reduced: cross-module calls -2
  🆕  tokenService() — new function, currently a Hermit (no callers yet)
```

---

## Tech Stack Candidates

### Parser options
- **tree-sitter**: Multi-language, fast, robust. Ideal long-term.
- **@typescript-eslint/parser**: Great for TS/JS, rich type info.
- **babel-parser**: JS/JSX, widely used, good community.
- **Start with one language** (JS/TS) and design the abstraction layer right.

### Git analysis
- `simple-git` npm package, or just shell out to `git log --follow -p`
- Parse commit messages for fix/bug/hotfix patterns
- Co-commit matrix: build an N×N function matrix, increment when two functions change in same commit

### Graph / topology
- **graphology**: solid JS graph library with community detection, centrality metrics
- **d3-force** for visualization
- **sigma.js** if we want a proper interactive graph renderer

### Architecture
```
sociograph/
  src/
    parsers/        # language-specific AST walkers → normalized CallGraph
    analyzers/      # fan-in/out, complexity, git history, co-commits
    archetypes/     # rules that map metrics → character types
    reporters/      # terminal, web, diff
    graph/          # topology analysis, clustering, bridge detection
  ui/               # optional web frontend (D3 graph)
```

---

## Open Questions / Hard Problems

1. **The Stranger detection** — how do we define "belongs here"?
   Module membership is easy. But determining semantic fit is hard.
   Possibly: if >70% of a function's calls are to *other* modules, it's a Stranger.

2. **Language agnosticism** — tree-sitter is the answer long-term,
   but the abstraction layer (normalized AST → CallGraph) needs to be solid.

3. **Dynamic call sites** — callbacks, higher-order functions, event emitters.
   Static analysis misses these. We may need a lightweight runtime tracer as phase 2.

4. **Thresholds** — what complexity score makes something a Workhorse?
   These probably need to be relative (top 10% of the codebase) not absolute.

5. **The presentation problem** — the sociological metaphors are evocative but
   could feel cutesy if overdone. We need the *insight* to land seriously
   even if the language is playful.

6. **Performance** — git log analysis on a 10-year repo could be slow.
   Caching strategy needed.

---

## Possible First Steps

- [ ] Build the call graph extractor for JS/TS using @typescript-eslint/parser
- [ ] Implement fan-in/fan-out and cyclomatic complexity metrics
- [ ] Build the archetype classifier (rules-based to start, tunable)
- [ ] Terminal reporter with the "society summary" output
- [ ] Add git history layer (co-commits, churn, fix-commits)
- [ ] Interactive D3 graph UI
- [ ] tree-sitter abstraction for multi-language support
- [ ] CI diff mode

---

## The Dream Version

A live, persistent social graph of your codebase that updates as you commit.
It learns your team's patterns. It flags when a function is accumulating too much
*social debt* — not just technical debt, but the relational kind.
It could answer questions like:

- "Which functions should I never touch right before a release?"
- "Where is our codebase most likely to break next?"
- "Which parts of the code does no one understand anymore?"

Not a linter. Not a static analyzer. A *mirror*.
