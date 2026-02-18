export function getStyles() {
  return `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0d1117;
  --surface: #161b22;
  --border: #30363d;
  --text: #e6edf3;
  --text-muted: #7d8590;
  --text-dim: #484f58;

  --c-boss:        #f97316;
  --c-workhorse:   #ef4444;
  --c-gossip:      #a855f7;
  --c-hermit:      #6b7280;
  --c-stranger:    #06b6d4;
  --c-overloaded:  #f59e0b;
  --c-ghost:       #374151;
  --c-crisis:      #dc2626;
  --c-codependent: #ec4899;
  --c-normal:      #3b82f6;
}

html, body {
  height: 100%;
  background: var(--bg);
  color: var(--text);
  font-family: ui-monospace, 'Cascadia Code', 'Fira Code', monospace;
  font-size: 13px;
  overflow: hidden;
}

/* ── Layout ─────────────────────────────────────────────── */

#app {
  display: grid;
  grid-template-rows: 48px 1fr;
  grid-template-columns: 1fr 320px;
  grid-template-areas:
    "toolbar toolbar"
    "graph   sidebar";
  height: 100vh;
}

#graph-container {
  grid-area: graph;
  position: relative;
  overflow: hidden;
}

#graph {
  width: 100%;
  height: 100%;
  cursor: grab;
}

#graph:active { cursor: grabbing; }

/* ── Toolbar ─────────────────────────────────────────────── */

#toolbar {
  grid-area: toolbar;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
  white-space: nowrap;
}

#toolbar-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  flex-shrink: 0;
}

#toolbar-title span { color: var(--c-normal); }

#toolbar-stats {
  color: var(--text-muted);
  font-size: 11px;
  flex-shrink: 0;
}

#toolbar-sep {
  flex: 1;
}

#search {
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 4px 10px;
  border-radius: 6px;
  font: inherit;
  width: 180px;
  outline: none;
}

#search:focus { border-color: var(--c-normal); }
#search::placeholder { color: var(--text-dim); }

.archetype-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.archetype-btn:hover { border-color: var(--text-muted); color: var(--text); }
.archetype-btn.active {
  border-color: var(--btn-color, var(--c-normal));
  color: var(--btn-color, var(--c-normal));
  background: color-mix(in srgb, var(--btn-color, var(--c-normal)) 10%, transparent);
}

.archetype-btn .count {
  background: var(--border);
  border-radius: 3px;
  padding: 0 4px;
  font-size: 10px;
}

/* ── Sidebar ─────────────────────────────────────────────── */

#sidebar {
  grid-area: sidebar;
  background: var(--surface);
  border-left: 1px solid var(--border);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

#sidebar-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 8px;
  color: var(--text-dim);
  text-align: center;
  padding: 24px;
  font-size: 12px;
  line-height: 1.6;
}

#sidebar-empty .hint { font-size: 28px; margin-bottom: 4px; }

#profile { display: none; flex-direction: column; }
#profile.visible { display: flex; }

#profile-header {
  padding: 16px;
  border-bottom: 1px solid var(--border);
}

#profile-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  word-break: break-all;
  margin-bottom: 4px;
}

#profile-location {
  font-size: 11px;
  color: var(--text-muted);
}

#profile-archetypes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.archetype-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid;
}

.archetype-reasons {
  padding: 8px 16px 12px;
  border-bottom: 1px solid var(--border);
}

.archetype-reasons .reason-item {
  font-size: 11px;
  color: var(--text-muted);
  padding: 2px 0;
  padding-left: 12px;
  position: relative;
}

.archetype-reasons .reason-item::before {
  content: '•';
  position: absolute;
  left: 2px;
  color: var(--text-dim);
}

#profile-metrics {
  padding: 12px 16px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  border-bottom: 1px solid var(--border);
}

.metric-item { display: flex; flex-direction: column; gap: 2px; }
.metric-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
.metric-value { font-size: 15px; font-weight: 600; color: var(--text); }

#profile-git {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.git-label {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.git-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  padding: 2px 0;
  color: var(--text-muted);
}

.git-row strong { color: var(--text); }

.fix-bar-bg {
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  margin-top: 6px;
  overflow: hidden;
}

.fix-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--c-crisis);
  transition: width 0.3s;
}

#profile-connections {
  padding: 12px 16px;
}

.conn-section { margin-bottom: 12px; }
.conn-label {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 6px;
}

.conn-item {
  font-size: 11px;
  color: var(--text-muted);
  padding: 2px 0;
  cursor: pointer;
  transition: color 0.1s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conn-item:hover { color: var(--c-normal); }
.conn-item .conn-module { color: var(--text-dim); }

/* ── Graph SVG ───────────────────────────────────────────── */

.edge {
  stroke: rgba(255,255,255,0.06);
  stroke-width: 1;
  fill: none;
  transition: opacity 0.2s;
}

.edge.cross-module { stroke: rgba(255,255,255,0.14); }

.node-circle {
  stroke: rgba(255,255,255,0.2);
  stroke-width: 1;
  transition: opacity 0.2s;
  cursor: pointer;
}

.node-label {
  fill: rgba(255,255,255,0.65);
  font-size: 9px;
  font-family: ui-monospace, monospace;
  pointer-events: none;
  transition: opacity 0.2s;
  user-select: none;
}

/* Focus dimming — toggled by class on <svg> */
#graph.has-focus .edge:not(.focused-edge) { opacity: 0.06; }
#graph.has-focus .node-circle:not(.focused-node) { opacity: 0.12; }
#graph.has-focus .node-label:not(.focused-label) { opacity: 0; }

/* Highlight matched search nodes */
.node-circle.search-match { stroke: white; stroke-width: 2; }

/* Crisis point pulse animation */
@keyframes crisis-pulse {
  0%, 100% { r: var(--base-r); opacity: 1; }
  50%       { r: calc(var(--base-r) + 3px); opacity: 0.7; }
}

.node-crisis-ring {
  fill: none;
  stroke: var(--c-crisis);
  stroke-width: 1.5;
  opacity: 0.6;
  animation: crisis-pulse 2s ease-in-out infinite;
}

/* ── Truncation banner ───────────────────────────────────── */

#truncation-banner {
  position: fixed;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  background: #1f2937;
  border: 1px solid var(--border);
  color: var(--text-muted);
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 11px;
  z-index: 10;
  display: flex;
  gap: 12px;
  align-items: center;
  max-width: 500px;
  text-align: center;
}

#truncation-banner button {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0;
  flex-shrink: 0;
}

/* ── Graph controls ──────────────────────────────────────── */
#graph-controls {
  position: absolute;
  bottom: 16px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.graph-btn {
  width: 32px;
  height: 32px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.graph-btn:hover { color: var(--text); border-color: var(--text-muted); }
`
}
