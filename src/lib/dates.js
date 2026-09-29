// Month keys are 'YYYY-MM' strings; dates are 'YYYY-MM-DD' strings (local calendar, no time zone math).

export const pad = n => String(n).padStart(2, '0')

export const toDateStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const monthKey = date => (typeof date === 'string' ? date.slice(0, 7) : toDateStr(date).slice(0, 7))

export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number)
  const idx = y * 12 + (m - 1) + n
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`
}

// Number of months from a to b (b - a). Same month → 0.
export function monthDiff(a, b) {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}

export function monthRange(fromKey, toKey) {
  const out = []
  for (let k = fromKey; monthDiff(k, toKey) >= 0; k = addMonths(k, 1)) out.push(k)
  return out
}

export const monthLabel = (key, style = 'short') => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: style, year: 'numeric' })
}

export const dateLabel = d => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })

// Monday of the week containing `date`, as a date string.
export function weekStart(date) {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return toDateStr(d)
}
