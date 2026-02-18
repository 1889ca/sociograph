import { logEvent } from '../utils/logger.js'

// THE BOSS candidate: called from handlers, services, everywhere
export function getUserById(id) {
  if (!id) return null
  return db.query('SELECT * FROM users WHERE id = ?', [id])
}

export function updateUser(id, data) {
  if (!id || !data) return null
  logEvent('db:update', { id })
  return db.query('UPDATE users SET ? WHERE id = ?', [data, id])
}

export function deleteUser(id) {
  if (!id) return false
  logEvent('db:delete', { id })
  db.query('DELETE FROM users WHERE id = ?', [id])
  return true
}

export function listUsers() {
  return db.query('SELECT * FROM users')
}

export function findUserByEmail(email) {
  if (!email) return null
  return db.query('SELECT * FROM users WHERE email = ?', [email])
}
