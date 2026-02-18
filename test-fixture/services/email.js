import { getUserById, findUserByEmail } from '../db/users.js'
import { logEvent } from '../utils/logger.js'
import { formatDate } from '../utils/format.js'

export function sendEmail(to, template, data) {
  const user = findUserByEmail(to)
  logEvent('email:send', { to, template })
  return mailer.send({ to, subject: getSubject(template), body: renderTemplate(template, { user, ...data }) })
}

// STRANGER candidate: lives in services but all its work is in db + utils
export function renderTemplate(template, context) {
  const user = context.user ?? getUserById(context.userId)
  const date = formatDate(context.date ?? new Date())
  logEvent('template:render', { template })
  if (template === 'welcome') return `Welcome ${user?.name}, joined on ${date}`
  if (template === 'reset') return `Reset your password by ${date}`
  return ''
}

function getSubject(template) {
  if (template === 'welcome') return 'Welcome!'
  if (template === 'reset') return 'Password Reset'
  return 'Notification'
}
