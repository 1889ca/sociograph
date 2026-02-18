// THE BOSS: everyone imports and calls logEvent
let events = []

export function logEvent(type, data) {
  events.push({ type, data, ts: Date.now() })
}

export function getEvents() {
  return [...events]
}

export function clearEvents() {
  events = []
}

// HERMIT: exists but nobody calls this from within the codebase
export function exportEventsToCSV() {
  return events.map(e => `${e.ts},${e.type},${JSON.stringify(e.data)}`).join('\n')
}
