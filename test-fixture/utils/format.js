// GOSSIP candidate: called from everywhere, calls into multiple modules
import { logEvent } from './logger.js'
import { getUserById } from '../db/users.js'

export function formatResponse(data) {
  if (!data) return null
  logEvent('format', { type: typeof data })
  return {
    ...data,
    _formatted: true,
    timestamp: new Date().toISOString(),
  }
}

// WORKHORSE candidate: complex, many params, called constantly
export function validateUser(user, opts, schema, context, flags) {
  if (!user) return false
  if (!user.email) return false
  if (!user.email.includes('@')) return false
  if (user.age && user.age < 0) return false
  if (user.age && user.age > 150) return false
  if (opts?.strict && !user.name) return false
  if (schema?.required) {
    for (const field of schema.required) {
      if (!user[field]) return false
    }
  }
  if (flags?.checkDb) {
    const existing = getUserById(user.id)
    if (!existing) return false
  }
  return true
}

export function sanitizeInput(input) {
  if (!input || typeof input !== 'object') return {}
  const result = {}
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'string') {
      result[k] = v.trim().replace(/<[^>]*>/g, '')
    } else {
      result[k] = v
    }
  }
  return result
}

export function formatDate(date) {
  if (!date) return ''
  return new Date(date).toISOString().split('T')[0]
}
