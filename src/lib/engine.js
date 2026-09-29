// Calculation engine (spec §16–17). Pure functions: (data, today) → numbers.
//
// data = { settings, goal, categories, income, expenses, savings, budgets }
//   savings rows are signed: + money into the wedding fund / a category, − money out
//   (withdrawals and the "from" side of a reallocation). goal_category_id null = Unallocated.
//   A wedding expense with funded_from 'income' was paid straight from income, so it counts
//   as a contribution to the fund and as spending at the same time.
//
// Terms used below:
//   saved / contributed  – everything ever put toward the wedding (including money already paid out)
//   reserved             – saved money still held (saved − wedding payments made from savings)

import { addMonths, monthDiff, monthKey, weekStart } from './dates.js'

const sum = (rows, f = r => r.amount) => rows.reduce((s, r) => s + (Number(f(r)) || 0), 0)
const inMonth = key => r => r.date.slice(0, 7) === key
const upTo = date => r => r.date <= date
const EPS = 1 // PKR tolerance for rounding

export const isWedding = e => e.expense_type === 'wedding'
export const fromIncome = e => isWedding(e) && e.funded_from === 'income'

// ── Savings ────────────────────────────────────────────────────────────────

// All rows that change the wedding fund's contributed total.
function contributionRows(data) {
  return [...data.savings, ...data.expenses.filter(fromIncome)]
}

// Opening balances (type 'opening') count as saved before the plan's first month began.
const isOpening = r => r.type === 'opening'

// Payments made before the app was used (category.paid_before) were saved and spent already:
// they count toward the target like an opening balance, but no longer sit in cash or reserves.
export const paidBefore = data => sum(data.categories, c => c.paid_before)

// What the plan started from: opening savings plus anything paid before the plan.
export const startingAmount = data => (Number(data.goal.starting_amount) || 0) + paidBefore(data)

export function calculateCurrentSavings(data, date = null) {
  const rows = contributionRows(data)
  return sum(date ? rows.filter(r => isOpening(r) || upTo(date)(r)) : rows) + paidBefore(data)
}

export function savedInMonth(data, key) {
  return sum(contributionRows(data).filter(r => !isOpening(r) && inMonth(key)(r)))
}

export function calculateReserved(data) {
  const paidFromSavings = data.expenses.filter(e => isWedding(e) && !fromIncome(e))
  return sum(data.savings) - sum(paidFromSavings)
}

// ── Goal ───────────────────────────────────────────────────────────────────

// The master target is the sum of category targets (so changing one rebalances the plan, §18).
export function calculateGoalTarget(data) {
  return data.categories.length ? sum(data.categories, c => c.target_amount) : Number(data.goal.target_amount) || 0
}

export function calculateGoalRemaining(data) {
  return Math.max(0, calculateGoalTarget(data) - calculateCurrentSavings(data))
}

// Last month in which saving counts. By default the wedding month itself is excluded.
export function lastSavingMonth(goal) {
  const target = monthKey(goal.target_date)
  return goal.include_target_month ? target : addMonths(target, -1)
}

// Saving months left, counting the current month.
export function calculateMonthsRemaining(goal, today) {
  return Math.max(0, monthDiff(monthKey(today), lastSavingMonth(goal)) + 1)
}

// Required saving for `key`, based on what was saved before that month started.
// Saving more during the month does not move this month's requirement; it lowers next month's.
export function requiredForMonth(data, key) {
  const savedBefore = calculateCurrentSavings(data, `${addMonths(key, -1)}-31`)
  const remaining = Math.max(0, calculateGoalTarget(data) - savedBefore)
  const months = Math.max(0, monthDiff(key, lastSavingMonth(data.goal)) + 1)
  return months > 0 ? remaining / months : remaining
}

export function calculateRequiredMonthlySavings(data, today) {
  return requiredForMonth(data, monthKey(today))
}

// Straight-line trajectory from the starting amount to the target, counting completed months only.
export function calculateExpectedSavingsToDate(data, today) {
  const { goal } = data
  const start = monthKey(goal.start_date)
  const total = Math.max(1, monthDiff(start, lastSavingMonth(goal)) + 1)
  const completed = Math.min(total, Math.max(0, monthDiff(start, monthKey(today))))
  const starting = startingAmount(data)
  return starting + (calculateGoalTarget(data) - starting) * (completed / total)
}

export function calculateSavingsVariance(data, today) {
  const actual = calculateCurrentSavings(data, typeof today === 'string' ? today : null)
  const expected = calculateExpectedSavingsToDate(data, today)
  return { actual, expected, variance: actual - expected, ratio: expected > 0 ? actual / expected : 1 }
}

// ── Monthly money equation (§7) ─────────────────────────────────────────────

export function budgetFor(data, key) {
  const rec = data.budgets.find(b => b.month === key)
  return {
    expected_income: Number(rec?.expected_income ?? data.settings.expected_income) || 0,
    essential_budget: Number(rec?.essential_budget ?? data.settings.essential_budget) || 0,
    record: rec || null,
  }
}

export function monthFlows(data, key) {
  const exp = data.expenses.filter(inMonth(key))
  const byType = t => sum(exp.filter(e => e.expense_type === t))
  return {
    income: sum(data.income.filter(inMonth(key))),
    essential: byType('essential'),
    lifestyle: byType('lifestyle'),
    wedding: byType('wedding'),
    weddingFromIncome: sum(exp.filter(fromIncome)),
    expenses: sum(exp),
    saved: savedInMonth(data, key),
  }
}

// Income − Essential − Required saving = Safe discretionary budget.
// Lifestyle spending and any essential overrun are charged against it.
export function calculateExpenseUtilization(data, today) {
  const key = monthKey(today)
  const b = budgetFor(data, key)
  const f = monthFlows(data, key)
  const required = requiredForMonth(data, key)
  const allowance = b.expected_income - b.essential_budget - required
  const essentialOverrun = Math.max(0, f.essential - b.essential_budget)
  const used = f.lifestyle + essentialOverrun
  const usage = allowance > 0 ? used / allowance : used > 0 ? Infinity : 0
  return { allowance, used, remaining: allowance - used, usage, essentialOverrun, required, ...b, flows: f }
}

// ── Forecast (§10) ─────────────────────────────────────────────────────────

// What a normal month is expected to save: average of up to 3 completed months since the goal
// started, else the planned figure from settings, else exactly the requirement.
export function expectedMonthlySaving(data, today) {
  const cur = monthKey(today)
  const start = monthKey(data.goal.start_date)
  const done = []
  for (let k = addMonths(cur, -1); monthDiff(start, k) >= 0 && done.length < 3; k = addMonths(k, -1)) done.push(k)
  // The goal's first month is usually partial (set up mid-month), so it is not a fair sample.
  const sample = done.filter(k => k !== start)
  if (sample.length) return sum(sample, k => savedInMonth(data, k)) / sample.length
  const planned = Number(data.settings.planned_monthly_saving)
  return planned > 0 ? planned : requiredForMonth(data, cur)
}

export function calculateProjectedFinalSavings(data, today) {
  const key = monthKey(today)
  const saved = calculateCurrentSavings(data)
  const months = calculateMonthsRemaining(data.goal, today)
  if (months === 0) return saved
  const expected = expectedMonthlySaving(data, today)
  const b = budgetFor(data, key)
  const f = monthFlows(data, key)
  // This month can save at most what is left after essentials and lifestyle spending.
  const capacity = b.expected_income - Math.max(b.essential_budget, f.essential) - f.lifestyle
  const thisMonth = Math.max(f.saved, Math.min(expected, capacity))
  return saved + (thisMonth - f.saved) + expected * (months - 1)
}

// ── Categories (§4, §11) ───────────────────────────────────────────────────

export function calculateCategoryProgress(data, today) {
  const start = monthKey(data.goal.start_date)
  const cur = monthKey(today)
  const rowsFor = id => r => (r.goal_category_id || null) === id
  const build = (c, id) => {
    const prior = Number(c.paid_before) || 0
    const contributed = sum(data.savings.filter(rowsFor(id))) + sum(data.expenses.filter(e => fromIncome(e) && rowsFor(id)(e))) + prior
    const recordedSpent = sum(data.expenses.filter(e => isWedding(e) && rowsFor(id)(e)))
    const spent = recordedSpent + prior
    const target = Number(c.target_amount) || 0
    const progress = target > 0 ? contributed / target : 0
    // Where the category should be by now if funded evenly up to its deadline.
    const end = c.deadline ? addMonths(monthKey(c.deadline), -1) : lastSavingMonth(data.goal)
    const total = Math.max(1, monthDiff(start, end) + 1)
    const expectedPct = Math.min(1, Math.max(0, monthDiff(start, cur)) / total)
    const status = target > 0 && contributed >= target - EPS ? 'funded' : progress + 0.001 >= expectedPct ? 'on-track' : 'behind'
    return {
      ...c,
      contributed,
      spent,
      recordedSpent,
      reserved: contributed - spent,
      remaining: Math.max(0, target - contributed),
      progress,
      expectedPct,
      overspent: spent > target + EPS ? spent - target : 0,
      status,
    }
  }
  const categories = data.categories.map(c => build(c, c.id))
  const unallocated = build({ id: null, name: 'Unallocated', target_amount: 0, priority: 'none' }, null)
  return { categories, unallocated }
}

const PRIORITY_ORDER = { optional: 0, important: 1, critical: 2 }

// When the plan is short, reduce optional categories first, then important; never critical (§11).
export function suggestCuts(categories, shortage) {
  const out = []
  let left = shortage
  const candidates = categories
    .filter(c => c.priority !== 'critical' && !c.is_contingency && c.remaining > 0)
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.remaining - a.remaining)
  for (const c of candidates) {
    if (left <= EPS) break
    const cut = Math.min(c.remaining, left)
    out.push({ id: c.id, name: c.name, priority: c.priority, cut })
    left -= cut
  }
  return { cuts: out, uncovered: Math.max(0, left) }
}

// Spread an amount over categories that still need money: critical first, then important, then optional.
export function autoAllocate(categories, amount) {
  const out = []
  let left = amount
  for (const tier of ['critical', 'important', 'optional']) {
    const need = categories.filter(c => c.priority === tier && !c.is_contingency && c.remaining > 0)
    const tierNeed = sum(need, c => c.remaining)
    if (left <= 0 || tierNeed <= 0) continue
    const share = Math.min(1, left / tierNeed)
    for (const c of need) {
      const amt = Math.round(c.remaining * share)
      if (amt > 0) out.push({ id: c.id, amount: amt })
    }
    left -= Math.min(left, tierNeed)
  }
  // Contingency buffer is filled last.
  const buf = categories.find(c => c.is_contingency && c.remaining > 0)
  if (left > 0 && buf) {
    const amt = Math.min(left, buf.remaining)
    out.push({ id: buf.id, amount: amt })
    left -= amt
  }
  // Fix rounding so the pieces add up exactly; anything that fits nowhere stays unallocated.
  const diff = amount - left - sum(out)
  if (out.length && Math.abs(diff) > 0) out[out.length - 1].amount += diff
  return { allocations: out, unallocated: Math.max(0, left) }
}

// ── Cash (§5) ──────────────────────────────────────────────────────────────

// Cash = last balance the user entered, plus income, minus expenses recorded since then.
export function calculateCashBalance(data) {
  const s = data.settings
  const base = Number(s.cash_balance) || 0
  const after = r => !s.cash_date || (r.date >= s.cash_date && (!s.cash_set_at || (r.created_at || '') > s.cash_set_at))
  return base + sum(data.income.filter(after)) - sum(data.expenses.filter(after))
}

// ── Risk (§8, §17) ─────────────────────────────────────────────────────────

export function determineRiskStatus({ ratio, projected, target, util, monthsRemaining }) {
  const red = []
  const yellow = []
  if (ratio < 0.9) red.push('Savings are more than 10% behind the plan.')
  else if (ratio < 1 - 1e-9) yellow.push('Savings are slightly behind the plan.')
  if (projected < target - EPS) red.push(`Projected savings miss the target by ${Math.round(target - projected).toLocaleString('en-US')}.`)
  if (util.allowance < 0) red.push('Expected income does not cover essentials plus the required saving.')
  else if (util.remaining < -EPS) red.push('Discretionary spending has exceeded this month’s allowance.')
  else if (util.usage >= 0.75) yellow.push(`${Math.round(util.usage * 100)}% of this month’s discretionary budget is used.`)
  if (monthsRemaining === 0 && projected < target - EPS) red.push('No saving months remain before the wedding.')
  const status = red.length ? 'red' : yellow.length ? 'yellow' : 'green'
  return { status, reasons: [...red, ...yellow] }
}

// ── Everything the UI needs, in one pass ───────────────────────────────────

export function computeAll(data, today) {
  const target = calculateGoalTarget(data)
  const saved = calculateCurrentSavings(data)
  const remaining = Math.max(0, target - saved)
  const monthsRemaining = calculateMonthsRemaining(data.goal, today)
  const util = calculateExpenseUtilization(data, today)
  const required = util.required
  const savedThisMonth = util.flows.saved
  const { expected, ratio, variance } = calculateSavingsVariance(data, today)
  const projected = calculateProjectedFinalSavings(data, today)
  const shortage = Math.max(0, target - projected)
  const cash = calculateCashBalance(data)
  const reserved = calculateReserved(data)
  const { categories, unallocated } = calculateCategoryProgress(data, today)
  const risk = determineRiskStatus({ ratio, projected, target, util, monthsRemaining })
  return {
    target,
    saved,
    remaining,
    progress: target > 0 ? Math.min(1, saved / target) : 0,
    monthsRemaining,
    required,
    savedThisMonth,
    stillToSaveThisMonth: Math.max(0, required - savedThisMonth),
    expectedToDate: expected,
    savingsRatio: ratio,
    savingsVariance: variance,
    projected,
    projectedDiff: projected - target,
    shortage,
    // Extra per month needed to close a projected shortage (spec §8 example).
    adjustmentPerMonth: shortage > 0 ? shortage / Math.max(1, monthsRemaining) : 0,
    util,
    cash,
    reserved,
    freeCash: cash - reserved,
    categories,
    unallocated,
    cuts: shortage > 0 ? suggestCuts(categories, shortage) : null,
    risk,
  }
}

// "Can I afford this?" (§9): rerun the engine with a hypothetical lifestyle purchase this month.
export function simulatePurchase(data, today, amount) {
  const before = computeAll(data, today)
  const hypothetical = { id: '__sim', amount, date: today, expense_type: 'lifestyle', expense_category: 'Simulation', created_at: new Date().toISOString() }
  const after = computeAll({ ...data, expenses: [...data.expenses, hypothetical] }, today)
  const discretionaryAfter = before.util.remaining - amount
  const reducesSaving = discretionaryAfter < -EPS
  const exceedsFreeCash = amount > before.freeCash + EPS
  let status = after.risk.status
  if (exceedsFreeCash) status = 'red'
  return {
    before,
    after,
    amount,
    discretionaryBefore: before.util.remaining,
    discretionaryAfter,
    reducesSaving,
    savingLost: reducesSaving ? Math.min(amount, -discretionaryAfter) : 0,
    exceedsFreeCash,
    trajectoryDiff: after.projected - after.target,
    status,
  }
}

// Weekly health summary (§20).
export function weeklySummary(data, today) {
  const from = weekStart(today)
  const inWeek = r => r.date >= from && r.date <= today
  const saved = sum(contributionRows(data).filter(r => !isOpening(r) && inWeek(r)))
  const util = calculateExpenseUtilization(data, today)
  const key = monthKey(today)
  const byCat = {}
  for (const e of data.expenses.filter(e => e.expense_type === 'lifestyle' && inMonth(key)(e))) {
    byCat[e.expense_category || 'Other'] = (byCat[e.expense_category || 'Other'] || 0) + e.amount
  }
  const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0] || null
  return { from, saved, usage: util.usage, used: util.used, allowance: util.allowance, topCategory: top ? { name: top[0], amount: top[1] } : null }
}

// Month-by-month history (§13): required vs actual.
export function monthlyHistory(data, today) {
  const start = monthKey(data.goal.start_date)
  const cur = monthKey(today)
  const rows = []
  for (let k = start; monthDiff(k, cur) >= 0; k = addMonths(k, 1)) {
    const f = monthFlows(data, k)
    const rec = data.budgets.find(b => b.month === k)
    // Past months keep the requirement stored when they were current; otherwise compute it.
    const required = k !== cur && rec?.required_savings != null ? Number(rec.required_savings) : requiredForMonth(data, k)
    const diff = f.saved - required
    const ratio = required > 0 ? f.saved / required : 1
    rows.push({
      month: k,
      current: k === cur,
      income: f.income,
      expenses: f.expenses,
      saved: f.saved,
      required,
      diff,
      status: ratio >= 1 - 1e-9 ? 'green' : ratio >= 0.9 ? 'yellow' : 'red',
    })
  }
  return rows
}
