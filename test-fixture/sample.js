// A little sample codebase to smoke test the parser

import { formatDate } from './utils.js'

export function processRequest(req, res) {
  const user = getUserById(req.params.id)
  if (!user) {
    return res.status(404).send('Not found')
  }
  const formatted = formatDate(user.createdAt)
  return res.json({ user, formatted })
}

function getUserById(id) {
  if (!id) return null
  return db.query(`SELECT * FROM users WHERE id = ?`, [id])
}

export const handleError = (err, req, res, next) => {
  console.error(err)
  if (err.statusCode) {
    res.status(err.statusCode).json({ error: err.message })
  } else {
    res.status(500).json({ error: 'Internal server error' })
  }
}

class UserService {
  async getUser(id) {
    const user = await getUserById(id)
    return this.formatUser(user)
  }

  formatUser(user) {
    if (!user) return null
    return {
      ...user,
      createdAt: formatDate(user.createdAt),
    }
  }
}
