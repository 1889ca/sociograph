export function formatDate(date) {
  if (!date) return ''
  return new Date(date).toISOString().split('T')[0]
}

export function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
}

export const isEmpty = (val) => val === null || val === undefined || val === ''
