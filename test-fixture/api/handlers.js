import { validateUser, sanitizeInput, formatResponse } from '../utils/format.js'
import { getUserById, updateUser, deleteUser, listUsers } from '../db/users.js'
import { sendEmail } from '../services/email.js'
import { logEvent } from '../utils/logger.js'

// THE BOSS candidate: called from many places
export function processRequest(req, res, context, config, middleware) {
  const input = sanitizeInput(req.body)
  const user = getUserById(input.id)
  if (!user) return res.status(404).json({ error: 'Not found' })
  const valid = validateUser(user)
  if (!valid) return res.status(400).json({ error: 'Invalid' })
  logEvent('process', { userId: user.id })
  return res.json(formatResponse(user))
}

export function createUser(req, res) {
  const input = sanitizeInput(req.body)
  const valid = validateUser(input)
  if (!valid) return res.status(400).json({ error: 'Invalid' })
  logEvent('create', input)
  sendEmail(input.email, 'welcome')
  return res.json({ ok: true })
}

export function updateUserHandler(req, res) {
  const input = sanitizeInput(req.body)
  const result = updateUser(input.id, input)
  logEvent('update', { id: input.id })
  return res.json(formatResponse(result))
}

export function deleteUserHandler(req, res) {
  const input = sanitizeInput(req.body)
  deleteUser(input.id)
  logEvent('delete', { id: input.id })
  return res.json({ ok: true })
}

export function listUsersHandler(req, res) {
  const users = listUsers()
  return res.json(users.map(formatResponse))
}
