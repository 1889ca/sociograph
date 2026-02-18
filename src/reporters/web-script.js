export function getAppScript() {
  return `
(function () {
  const DATA = window.__SOCIOGRAPH__

  // ── Archetype colors ────────────────────────────────────
  const COLORS = {
    'The Boss':         '#f97316',
    'The Workhorse':    '#ef4444',
    'The Gossip':       '#a855f7',
    'The Hermit':       '#6b7280',
    'The Stranger':     '#06b6d4',
    'The Overloaded':   '#f59e0b',
    'The Ghost':        '#4b5563',
    'The Crisis Point': '#dc2626',
    'The Codependent':  '#ec4899',
    __normal__:         '#3b82f6',
  }

  function nodeColor(d) {
    return d.archetypes.length > 0
      ? (COLORS[d.archetypes[0].label] ?? COLORS.__normal__)
      : COLORS.__normal__
  }

  function nodeRadius(d) {
    return Math.max(4, Math.min(22, 4 + Math.sqrt(d.fanIn + d.fanOut) * 1.8))
  }

  // ── Bootstrap ───────────────────────────────────────────
  const { nodes, edges, meta, modules, summary } = DATA

  // Toolbar stats
  document.getElementById('toolbar-title').innerHTML =
    'SOCIOGRAPH &nbsp;' + '<span>' + (meta.path || '.') + '</span>'
  document.getElementById('toolbar-stats').textContent =
    nodes.length + ' nodes · ' + edges.length + ' edges' +
    (meta.truncated ? '  (top ' + nodes.length + ' of ' + meta.totalFunctions + ')' : '')

  // ── Build archetype filter buttons ─────────────────────
  const archetypeCounts = {}
  for (const node of nodes) {
    for (const a of node.archetypes) {
      archetypeCounts[a.label] = (archetypeCounts[a.label] || 0) + 1
    }
  }

  const activeArchetypes = new Set()
  const filterBar = document.getElementById('filter-bar')

  for (const [label, count] of Object.entries(archetypeCounts).sort((a,b) => b[1]-a[1])) {
    const color = COLORS[label] || COLORS.__normal__
    const btn = document.createElement('button')
    btn.className = 'archetype-btn'
    btn.style.setProperty('--btn-color', color)
    btn.dataset.label = label
    btn.innerHTML =
      (DATA.nodes.find(n => n.archetypes[0]?.label === label)?.archetypes[0]?.emoji || '') +
      ' ' + label.replace('The ','') +
      '<span class="count">' + count + '</span>'
    btn.addEventListener('click', () => {
      if (activeArchetypes.has(label)) {
        activeArchetypes.delete(label)
        btn.classList.remove('active')
      } else {
        activeArchetypes.add(label)
        btn.classList.add('active')
      }
      applyFilters()
    })
    filterBar.appendChild(btn)
  }

  // ── Search ──────────────────────────────────────────────
  document.getElementById('search').addEventListener('input', function() {
    applyFilters()
  })

  function applyFilters() {
    const q = document.getElementById('search').value.trim().toLowerCase()
    nodeGroup.selectAll('.node-circle')
      .classed('search-match', d =>
        q.length > 0 && (d.name.toLowerCase().includes(q) || d.relPath.toLowerCase().includes(q))
      )

    if (activeArchetypes.size === 0 && !q) {
      nodeGroup.selectAll('.node-wrap').style('display', null)
      edgeGroup.selectAll('.edge').style('display', null)
      return
    }

    const visibleIds = new Set()
    nodeGroup.selectAll('.node-wrap').style('display', d => {
      const matchesArchetype = activeArchetypes.size === 0 ||
        d.archetypes.some(a => activeArchetypes.has(a.label))
      const matchesSearch = !q || d.name.toLowerCase().includes(q) || d.relPath.toLowerCase().includes(q)
      const show = matchesArchetype && matchesSearch
      if (show) visibleIds.add(d.id)
      return show ? null : 'none'
    })

    edgeGroup.selectAll('.edge').style('display', e =>
      visibleIds.has(e.source.id || e.source) && visibleIds.has(e.target.id || e.target)
        ? null : 'none'
    )
  }

  // ── SVG + zoom ──────────────────────────────────────────
  const svg = d3.select('#graph')
  const W = svg.node().clientWidth || 1200
  const H = svg.node().clientHeight || 800

  const zoomG = svg.append('g')
  const edgeGroup = zoomG.append('g').attr('class', 'edges')
  const nodeGroup = zoomG.append('g').attr('class', 'nodes')

  const zoom = d3.zoom()
    .scaleExtent([0.05, 4])
    .on('zoom', e => {
      zoomG.attr('transform', e.transform)
      // Hide labels when zoomed out
      nodeGroup.selectAll('.node-label')
        .style('display', e.transform.k < 0.45 ? 'none' : null)
    })

  svg.call(zoom)
  svg.on('click', function(e) {
    if (e.target === this || e.target.closest('.edges')) clearFocus()
  })

  // ── Module centroids ────────────────────────────────────
  const moduleNames = [...new Set(nodes.map(n => n.module).filter(Boolean))]
  const moduleCentroids = new Map()
  const R = Math.min(W, H) * 0.32
  moduleNames.forEach((m, i) => {
    const angle = (i / moduleNames.length) * 2 * Math.PI - Math.PI / 2
    moduleCentroids.set(m, { x: W/2 + R * Math.cos(angle), y: H/2 + R * Math.sin(angle) })
  })

  // ── Force simulation ─────────────────────────────────────
  const isLarge = nodes.length > 300

  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(edges).id(d => d.id).distance(isLarge ? 25 : 55))
    .force('charge', d3.forceManyBody().strength(isLarge ? -25 : -60))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collide', d3.forceCollide().radius(d => nodeRadius(d) + 3))
    .force('modules', moduleClusterForce)
    .alphaDecay(isLarge ? 0.04 : 0.02)
    .on('tick', ticked)

  function moduleClusterForce(alpha) {
    const strength = alpha * 0.06
    for (const d of nodes) {
      const c = moduleCentroids.get(d.module)
      if (!c) continue
      d.vx += (c.x - d.x) * strength
      d.vy += (c.y - d.y) * strength
    }
  }

  // Pre-settle layout before first paint
  simulation.stop()
  const preTicks = isLarge ? 300 : 200
  for (let i = 0; i < preTicks; i++) simulation.tick()
  simulation.restart()

  // ── Edges ────────────────────────────────────────────────
  const edgeSel = edgeGroup.selectAll('.edge')
    .data(edges)
    .join('line')
    .attr('class', d => 'edge' + (d.crossModule ? ' cross-module' : ''))

  // ── Nodes ────────────────────────────────────────────────
  const nodeWrap = nodeGroup.selectAll('.node-wrap')
    .data(nodes)
    .join('g')
    .attr('class', 'node-wrap')
    .call(d3.drag()
      .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.2).restart(); d.fx = d.x; d.fy = d.y })
      .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y })
      .on('end',   (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null })
    )
    .on('click', (e, d) => { e.stopPropagation(); focusNode(d.id) })

  // Crisis point pulse ring (rendered behind the circle)
  nodeWrap.filter(d => d.archetypes.some(a => a.label === 'The Crisis Point'))
    .append('circle')
    .attr('class', 'node-crisis-ring')
    .attr('r', d => nodeRadius(d) + 5)
    .style('--base-r', d => nodeRadius(d) + 5 + 'px')

  const circles = nodeWrap.append('circle')
    .attr('class', 'node-circle')
    .attr('r', d => nodeRadius(d))
    .attr('fill', d => nodeColor(d))

  // Labels — only show for notable nodes by default
  nodeWrap.filter(d => d.fanIn > 1 || d.archetypes.length > 0)
    .append('text')
    .attr('class', 'node-label')
    .attr('dx', d => nodeRadius(d) + 3)
    .attr('dy', '0.35em')
    .text(d => d.name.length > 22 ? d.name.slice(0, 21) + '…' : d.name)

  // ── Tick ─────────────────────────────────────────────────
  function ticked() {
    edgeSel
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y)

    nodeWrap.selectAll('circle').attr('cx', d => d.x).attr('cy', d => d.y)
    nodeWrap.selectAll('text').attr('x', d => d.x).attr('y', d => d.y)
  }

  // ── Focus / hover ─────────────────────────────────────────
  let focusedId = null

  function focusNode(id) {
    focusedId = id
    const d = nodes.find(n => n.id === id)
    if (!d) return

    // Find directly connected node IDs
    const connected = new Set([id])
    edges.forEach(e => {
      const sid = e.source.id || e.source
      const tid = e.target.id || e.target
      if (sid === id) connected.add(tid)
      if (tid === id) connected.add(sid)
    })

    svg.classed('has-focus', true)
    nodeGroup.selectAll('.node-circle')
      .classed('focused-node', n => connected.has(n.id))
    nodeGroup.selectAll('.node-label')
      .classed('focused-label', n => connected.has(n.id))
    edgeGroup.selectAll('.edge')
      .classed('focused-edge', e => {
        const s = e.source.id || e.source
        const t = e.target.id || e.target
        return s === id || t === id
      })

    openProfile(d)
  }

  function clearFocus() {
    focusedId = null
    svg.classed('has-focus', false)
    nodeGroup.selectAll('.node-circle, .node-label').classed('focused-node focused-label', false)
    edgeGroup.selectAll('.edge').classed('focused-edge', false)
    document.getElementById('profile').classList.remove('visible')
    document.getElementById('sidebar-empty').style.display = ''
  }

  // ── Sidebar profile ───────────────────────────────────────
  function openProfile(d) {
    document.getElementById('sidebar-empty').style.display = 'none'
    const profile = document.getElementById('profile')
    profile.classList.add('visible')

    document.getElementById('profile-name').textContent = d.name
    document.getElementById('profile-location').textContent =
      d.relPath + ':' + d.line

    // Archetypes
    const badgeContainer = document.getElementById('profile-archetypes')
    badgeContainer.innerHTML = ''
    const reasonContainer = document.getElementById('archetype-reasons')
    reasonContainer.innerHTML = ''

    if (d.archetypes.length === 0) {
      badgeContainer.innerHTML = '<span style="color:var(--text-dim);font-size:11px">No archetype — normal function</span>'
    } else {
      for (const a of d.archetypes) {
        const color = COLORS[a.label] || COLORS.__normal__
        const badge = document.createElement('span')
        badge.className = 'archetype-badge'
        badge.style.color = color
        badge.style.borderColor = color + '50'
        badge.style.background = color + '14'
        badge.textContent = a.emoji + ' ' + a.label
        badgeContainer.appendChild(badge)
      }
      // Reasons from top archetype
      for (const reason of d.archetypes[0].reasons) {
        const item = document.createElement('div')
        item.className = 'reason-item'
        item.textContent = reason
        reasonContainer.appendChild(item)
      }
    }

    // Metrics
    document.getElementById('m-fanin').textContent    = d.fanIn
    document.getElementById('m-fanout').textContent   = d.fanOut
    document.getElementById('m-cx').textContent       = d.complexity
    document.getElementById('m-loc').textContent      = d.linesOfCode
    document.getElementById('m-params').textContent   = d.params
    document.getElementById('m-module').textContent   = d.module || '—'

    // Git metrics
    const gitSection = document.getElementById('profile-git')
    if (d.gitMetrics && d.gitMetrics.commits > 0) {
      gitSection.style.display = ''
      const g = d.gitMetrics
      document.getElementById('g-commits').textContent  = g.commits
      document.getElementById('g-fixes').textContent    = g.fixCommits
      document.getElementById('g-authors').textContent  = g.authorsCount
      document.getElementById('g-first').textContent    = g.firstSeen ? new Date(g.firstSeen).toLocaleDateString() : '—'
      document.getElementById('g-last').textContent     = g.lastSeen  ? new Date(g.lastSeen).toLocaleDateString()  : '—'
      const ratio = g.commits > 0 ? g.fixCommits / g.commits : 0
      document.getElementById('g-fix-bar').style.width  = Math.round(ratio * 100) + '%'
    } else {
      gitSection.style.display = 'none'
    }

    // Connections
    const callerList = document.getElementById('caller-list')
    const calleeList = document.getElementById('callee-list')
    callerList.innerHTML = ''
    calleeList.innerHTML = ''

    const callers = edges
      .filter(e => (e.target.id || e.target) === d.id)
      .map(e => nodes.find(n => n.id === (e.source.id || e.source)))
      .filter(Boolean)
      .slice(0, 8)

    const callees = edges
      .filter(e => (e.source.id || e.source) === d.id)
      .map(e => nodes.find(n => n.id === (e.target.id || e.target)))
      .filter(Boolean)
      .slice(0, 8)

    for (const n of callers) {
      const item = document.createElement('div')
      item.className = 'conn-item'
      item.innerHTML = n.name + ' <span class="conn-module">' + n.module + '</span>'
      item.addEventListener('click', () => focusNode(n.id))
      callerList.appendChild(item)
    }
    if (callers.length === 0) callerList.innerHTML = '<div class="conn-item" style="cursor:default">none in view</div>'

    for (const n of callees) {
      const item = document.createElement('div')
      item.className = 'conn-item'
      item.innerHTML = n.name + ' <span class="conn-module">' + n.module + '</span>'
      item.addEventListener('click', () => focusNode(n.id))
      calleeList.appendChild(item)
    }
    if (callees.length === 0) calleeList.innerHTML = '<div class="conn-item" style="cursor:default">none in view</div>'

    document.getElementById('caller-header').textContent =
      'CALLERS (' + d.fanIn + ' total)'
    document.getElementById('callee-header').textContent =
      'CALLEES (' + d.fanOut + ' total)'
  }

  // ── Graph controls ────────────────────────────────────────
  document.getElementById('btn-zoom-in').addEventListener('click',  () =>
    svg.transition().call(zoom.scaleBy, 1.4))
  document.getElementById('btn-zoom-out').addEventListener('click', () =>
    svg.transition().call(zoom.scaleBy, 0.7))
  document.getElementById('btn-fit').addEventListener('click', fitView)

  function fitView() {
    const visNodes = nodes.filter(n => !isNaN(n.x))
    if (!visNodes.length) return
    const xs = visNodes.map(n => n.x)
    const ys = visNodes.map(n => n.y)
    const minX = Math.min(...xs) - 40, maxX = Math.max(...xs) + 40
    const minY = Math.min(...ys) - 40, maxY = Math.max(...ys) + 40
    const scale = Math.min(0.9, Math.min(W / (maxX - minX), H / (maxY - minY)))
    const tx = W / 2 - scale * (minX + maxX) / 2
    const ty = H / 2 - scale * (minY + maxY) / 2
    svg.transition().duration(600)
      .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale))
  }

  // Initial fit after simulation settles
  setTimeout(fitView, 1200)

  // ── Truncation banner ─────────────────────────────────────
  if (meta.truncated) {
    const banner = document.getElementById('truncation-banner')
    banner.style.display = 'flex'
    document.getElementById('truncation-msg').textContent =
      'Showing top ' + meta.renderedFunctions + ' of ' +
      meta.totalFunctions + ' functions by importance. Use --limit=N to change.'
    document.getElementById('truncation-close').addEventListener('click', () =>
      banner.style.display = 'none')
  }

})()
`
}
