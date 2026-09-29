// Monthly profit share sent over from Studio Ledger (the studio's accounting page).
// The ledger's "Copy for Wedding Fund" button produces a small JSON code; it's pasted here and
// recorded as Business income. One income row per month, so pasting a month again updates it.

import { monthKey, monthDiff, pad } from './dates.js'

export const LEDGER_SOURCE = 'studio-ledger'

const isNum = v => typeof v === 'number' && Number.isFinite(v)

export function parseLedgerCode(text) {
  let o
  try { o = JSON.parse(String(text).trim()) } catch { throw new Error('That isn’t a Studio Ledger code. In the ledger, open Partners → Send to Wedding Fund and copy it again.') }
  if (!o || o.app !== LEDGER_SOURCE || o.kind !== 'partner-share') throw new Error('That isn’t a Studio Ledger code. In the ledger, open Partners → Send to Wedding Fund and copy it again.')
  if (o.version !== 1) throw new Error('This code comes from a newer version of Studio Ledger. Update Wedding Fund to import it.')
  if (typeof o.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(o.month)) throw new Error('The code has no valid month.')
  if (!isNum(o.amount_pkr)) throw new Error('The code has no valid amount.')
  if (!isNum(o.pct) || o.pct < 0 || o.pct > 100) throw new Error('The code has no valid profit share %.')
  const num = k => (isNum(o[k]) ? o[k] : null)
  return {
    month: o.month,
    partner: typeof o.partner === 'string' ? o.partner.slice(0, 80) : 'Partner',
    pct: o.pct,
    amount: Math.round(o.amount_pkr),
    profit: num('profit_pkr'),
    revenue: num('revenue_pkr'),
    expenses: num('expenses_pkr'),
    rate: num('rate'),
    generatedAt: typeof o.generated_at === 'string' ? o.generated_at : null,
  }
}

// Dated inside its month: today for the current month, otherwise the month's last day.
export function incomeDateFor(month, today) {
  const cur = monthKey(today)
  if (monthDiff(cur, month) > 0) throw new Error('That month hasn’t started yet.')
  if (month === cur) return today
  const [y, m] = month.split('-').map(Number)
  return `${month}-${pad(new Date(y, m, 0).getDate())}`
}

export const ledgerDescription = s => `Studio profit share (${s.pct}%)`

export const findLedgerIncome = (income, month) => income.find(r => r.source === LEDGER_SOURCE && r.source_ref === month) || null
