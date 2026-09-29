import { reactive, computed, watch } from 'vue'
import { createAdapter, TABLES } from './lib/storage.js'
import { computeAll, monthlyHistory, weeklySummary, autoAllocate, monthFlows, requiredForMonth, budgetFor } from './lib/engine.js'
import { DEFAULT_CATEGORIES, splitTarget } from './lib/defaults.js'
import { toDateStr, monthKey } from './lib/dates.js'
import { uid } from './lib/format.js'
import { LEDGER_SOURCE, findLedgerIncome, incomeDateFor, ledgerDescription } from './lib/ledger.js'

export const state = reactive({
  ready: false,
  error: '',
  adapter: null,
  authUser: null,
  today: toDateStr(),
  db: Object.fromEntries(TABLES.map(t => [t, []])),
})

const now = () => new Date().toISOString()

export const profile = computed(() => state.db.users[0] || null)
export const goal = computed(() => state.db.goals.find(g => g.status !== 'archived') || null)

// The shape the calculation engine works on.
export const data = computed(() => {
  const g = goal.value
  if (!g) return null
  return {
    settings: profile.value?.settings || {},
    goal: g,
    categories: state.db.goal_categories.filter(c => c.goal_id === g.id).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)),
    income: state.db.income,
    expenses: state.db.expenses,
    savings: state.db.savings_transactions.filter(s => s.goal_id === g.id),
    budgets: state.db.monthly_budgets,
  }
})

// Recalculated automatically whenever any transaction, category or setting changes (§16).
export const metrics = computed(() => (data.value ? computeAll(data.value, state.today) : null))
export const history = computed(() => (data.value ? monthlyHistory(data.value, state.today) : []))
export const weekly = computed(() => (data.value ? weeklySummary(data.value, state.today) : null))

// ── persistence helpers ────────────────────────────────────────────────────

async function insert(table, rows) {
  rows = (Array.isArray(rows) ? rows : [rows]).map(r => ({ id: uid(), created_at: now(), ...r }))
  await state.adapter.insert(table, rows)
  state.db[table].push(...rows.map(r => ({ ...r, user_id: state.authUser?.id })))
  return rows
}

async function update(table, id, patch) {
  await state.adapter.update(table, id, patch)
  const row = state.db[table].find(r => r.id === id)
  if (row) Object.assign(row, patch)
}

async function remove(table, ids) {
  ids = Array.isArray(ids) ? ids : [ids]
  await state.adapter.remove(table, ids)
  state.db[table] = state.db[table].filter(r => !ids.includes(r.id))
}

// ── lifecycle ──────────────────────────────────────────────────────────────

export async function init() {
  try {
    state.adapter = await createAdapter()
    state.adapter.onAuthChange(async user => {
      state.authUser = user
      if (user) await load()
      else state.db = Object.fromEntries(TABLES.map(t => [t, []]))
    })
    state.authUser = await state.adapter.getUser()
    if (state.authUser) await load()
  } catch (e) {
    state.error = e.message
  }
  state.ready = true
  // Pick up a new day / month when the app is left open or brought back to the foreground.
  const tick = () => { state.today = toDateStr() }
  setInterval(tick, 60_000)
  document.addEventListener('visibilitychange', tick)
}

async function load() {
  state.db = await state.adapter.loadAll()
}

// Monthly reset (§21): each month gets a budget record. While a month is current its requirement is kept
// up to date; once it has passed, the stored figures become that month's history.
let syncTimer = null
watch(
  () => metrics.value && [monthKey(state.today), Math.round(metrics.value.required), Math.round(metrics.value.savedThisMonth)],
  v => {
    if (!v) return
    clearTimeout(syncTimer)
    syncTimer = setTimeout(syncMonthRecords, 800)
  },
  { immediate: true },
)

async function syncMonthRecords() {
  const d = data.value
  if (!d) return
  const cur = monthKey(state.today)
  // Close any past months that never got a record (app not opened that month).
  for (const row of history.value) {
    const rec = state.db.monthly_budgets.find(b => b.month === row.month)
    const required = Math.round(row.current ? requiredForMonth(d, row.month) : row.required)
    const b = budgetFor(d, row.month)
    const fields = {
      required_savings: required,
      discretionary_budget: Math.round(b.expected_income - b.essential_budget - required),
      actual_savings: Math.round(monthFlows(d, row.month).saved),
    }
    if (!rec) {
      await insert('monthly_budgets', {
        month: row.month,
        expected_income: d.settings.expected_income || 0,
        essential_budget: d.settings.essential_budget || 0,
        ...fields,
      })
    } else if (row.month === cur || rec.actual_savings !== fields.actual_savings) {
      // Only the current month's requirement moves; past months keep theirs.
      const patch = row.month === cur ? fields : { actual_savings: fields.actual_savings }
      if (Object.entries(patch).some(([k, v]) => rec[k] !== v)) await update('monthly_budgets', rec.id, patch)
    }
  }
}

// ── setup ──────────────────────────────────────────────────────────────────

export async function createPlan(f) {
  const settings = {
    expected_income: f.income,
    essential_budget: f.essential,
    cash_balance: f.cash,
    cash_date: state.today,
    cash_set_at: now(),
    weekly_seen: null,
  }
  if (profile.value) await update('users', profile.value.id, { name: f.name, settings })
  else await insert('users', { id: state.authUser?.id || 'local', name: f.name, currency: 'PKR', settings })

  const [g] = await insert('goals', {
    name: 'Wedding Fund',
    target_amount: f.target,
    target_date: f.weddingDate,
    start_date: state.today,
    starting_amount: f.saved,
    include_target_month: false,
    status: 'active',
  })
  const targets = splitTarget(f.target)
  await insert('goal_categories', DEFAULT_CATEGORIES.map((c, i) => ({
    goal_id: g.id,
    name: c.name,
    target_amount: targets[i],
    priority: c.priority,
    deadline: null,
    notes: c.notes,
    is_contingency: !!c.is_contingency,
    sort: i,
  })))
  if (f.saved > 0) {
    await insert('savings_transactions', { goal_id: g.id, goal_category_id: null, amount: f.saved, date: state.today, type: 'opening', notes: 'Wedding savings when the plan started' })
    if (f.allocate) await allocateUnallocated()
  }
}

// ── goal & categories ──────────────────────────────────────────────────────

export const updateGoal = patch => update('goals', goal.value.id, patch)
export const updateSettings = patch => update('users', profile.value.id, { settings: { ...profile.value.settings, ...patch } })

// Setting a new overall target scales every category proportionally, so the parts still add up.
export async function scaleTarget(newTotal) {
  const cats = data.value.categories
  const old = cats.reduce((s, c) => s + c.target_amount, 0)
  if (!cats.length || old <= 0) return updateGoal({ target_amount: newTotal })
  let assigned = 0
  for (const [i, c] of cats.entries()) {
    const t = i === cats.length - 1 ? newTotal - assigned : Math.round((c.target_amount / old) * newTotal / 1000) * 1000
    assigned += t
    await update('goal_categories', c.id, { target_amount: t })
  }
  await updateGoal({ target_amount: newTotal })
}

async function syncGoalTarget() {
  const total = data.value.categories.reduce((s, c) => s + c.target_amount, 0)
  if (total !== goal.value.target_amount) await updateGoal({ target_amount: total })
}

export async function saveCategory(c) {
  const fields = { name: c.name, target_amount: c.target_amount, paid_before: c.paid_before || 0, priority: c.priority, deadline: c.deadline || null, notes: c.notes || '', is_contingency: !!c.is_contingency }
  if (c.id) await update('goal_categories', c.id, fields)
  else await insert('goal_categories', { ...fields, goal_id: goal.value.id, sort: data.value.categories.length })
  await syncGoalTarget()
}

// Deleting a category returns its saved money to Unallocated rather than losing it.
export async function deleteCategory(id) {
  const g = goal.value
  const rows = state.db.savings_transactions.filter(s => s.goal_category_id === id)
  for (const r of rows) await update('savings_transactions', r.id, { goal_category_id: null })
  for (const e of state.db.expenses.filter(e => e.goal_category_id === id)) await update('expenses', e.id, { goal_category_id: null })
  await remove('goal_categories', id)
  if (g) await syncGoalTarget()
}

// ── transactions ───────────────────────────────────────────────────────────

export async function saveIncome(r) {
  const fields = { amount: r.amount, income_type: r.income_type, date: r.date, description: r.description || '' }
  if (r.id) await update('income', r.id, fields)
  else await insert('income', fields)
}

// A month's profit share from Studio Ledger. Recorded once per month as Business income, so
// importing the same month again updates that row instead of adding a second one.
// saveAmount (current month only) also moves that much into wedding savings, critical categories first.
export async function importLedgerShare(share, { saveAmount = 0 } = {}) {
  const existing = findLedgerIncome(state.db.income, share.month)
  if (share.amount <= 0) {
    if (existing) await remove('income', existing.id)
    return existing ? 'removed' : 'none'
  }
  const date = incomeDateFor(share.month, state.today)
  const fields = { amount: share.amount, income_type: 'Business', date, description: ledgerDescription(share), source: LEDGER_SOURCE, source_ref: share.month }
  if (existing) await update('income', existing.id, fields)
  else await insert('income', fields)
  if (saveAmount > 0) await addSavings({ amount: saveAmount, date, categoryId: 'auto', notes: 'From studio profit share' })
  return existing ? 'updated' : 'added'
}

export async function saveExpense(r, { coverFromBuffer = 0 } = {}) {
  const wedding = r.expense_type === 'wedding'
  const fields = {
    amount: r.amount,
    expense_type: r.expense_type,
    expense_category: wedding ? data.value.categories.find(c => c.id === r.goal_category_id)?.name || 'Wedding' : r.expense_category,
    goal_category_id: wedding ? r.goal_category_id || null : null,
    funded_from: wedding ? r.funded_from || 'reserve' : null,
    date: r.date,
    description: r.description || '',
  }
  if (r.id) await update('expenses', r.id, fields)
  else await insert('expenses', fields)
  // Contingency fund (§19): move money from the buffer into a category that genuinely ran over.
  if (coverFromBuffer > 0) {
    const buf = data.value.categories.find(c => c.is_contingency)
    if (buf) await reallocate(buf.id, fields.goal_category_id, coverFromBuffer, r.date, `Cover overrun: ${fields.description || fields.expense_category}`)
  }
}

// categoryId: a category id, null for Unallocated, or 'auto' to split by priority.
export async function addSavings({ amount, date, categoryId, notes }) {
  const g = goal.value
  if (categoryId === 'auto') {
    const { allocations, unallocated } = autoAllocate(metrics.value.categories, amount)
    const rows = allocations.map(a => ({ goal_id: g.id, goal_category_id: a.id, amount: a.amount, date, type: 'deposit', notes: notes || 'Auto-allocated by priority' }))
    if (unallocated > 0) rows.push({ goal_id: g.id, goal_category_id: null, amount: unallocated, date, type: 'deposit', notes: notes || '' })
    await insert('savings_transactions', rows)
  } else {
    await insert('savings_transactions', { goal_id: g.id, goal_category_id: categoryId || null, amount, date, type: 'deposit', notes: notes || '' })
  }
}

export async function withdrawSavings({ amount, date, categoryId, notes }) {
  await insert('savings_transactions', { goal_id: goal.value.id, goal_category_id: categoryId || null, amount: -amount, date, type: 'withdrawal', notes: notes || '' })
}

// Moving money between categories doesn't change the total saved; it's recorded as a matched pair.
export async function reallocate(fromId, toId, amount, date = state.today, notes = '') {
  const pair = uid()
  const g = goal.value
  await insert('savings_transactions', [
    { goal_id: g.id, goal_category_id: fromId || null, amount: -amount, date, type: 'reallocation', notes, pair_id: pair },
    { goal_id: g.id, goal_category_id: toId || null, amount, date, type: 'reallocation', notes, pair_id: pair },
  ])
}

export async function allocateUnallocated() {
  const amount = Math.round(metrics.value.unallocated.reserved)
  if (amount <= 0) return 0
  const { allocations } = autoAllocate(metrics.value.categories, amount)
  const g = goal.value
  const pair = uid()
  const moved = allocations.reduce((s, a) => s + a.amount, 0)
  if (!moved) return 0
  await insert('savings_transactions', [
    { goal_id: g.id, goal_category_id: null, amount: -moved, date: state.today, type: 'reallocation', notes: 'Auto-allocated by priority', pair_id: pair },
    ...allocations.map(a => ({ goal_id: g.id, goal_category_id: a.id, amount: a.amount, date: state.today, type: 'reallocation', notes: 'Auto-allocated by priority', pair_id: pair })),
  ])
  return moved
}

export async function deleteTransaction(table, row) {
  // Both halves of a reallocation go together.
  const ids = row.pair_id ? state.db[table].filter(r => r.pair_id === row.pair_id).map(r => r.id) : [row.id]
  await remove(table, ids)
}

export async function saveMonthBudget(month, patch) {
  const rec = state.db.monthly_budgets.find(b => b.month === month)
  if (rec) await update('monthly_budgets', rec.id, patch)
  else await insert('monthly_budgets', { month, ...patch })
}

// ── backup (local mode) ────────────────────────────────────────────────────

export function exportBackup() {
  return JSON.stringify({ app: 'wedding-fund', version: 1, exported_at: now(), db: state.db }, null, 2)
}

export async function importBackup(text) {
  const parsed = JSON.parse(text)
  if (parsed.app !== 'wedding-fund' || !parsed.db) throw new Error('This file is not a Wedding Fund backup.')
  await state.adapter.replaceAll(parsed.db)
  await load()
}

export async function resetAll() {
  await state.adapter.replaceAll({})
  await load()
}

export const updateSavingsRow = (id, patch) => update('savings_transactions', id, patch)
export const updateProfileName = name => update('users', profile.value.id, { name: name.trim() })

// Return every category's held money to Unallocated (one undoable move), optionally clearing
// amounts entered as paid before using the app. Total savings are unchanged.
export async function resetFunding({ clearPaidBefore = false } = {}) {
  const g = goal.value
  const held = metrics.value.categories.filter(c => c.reserved > 0.5)
  const total = held.reduce((s, c) => s + c.reserved, 0)
  if (held.length) {
    const pair = uid()
    const notes = 'Funding reset'
    await insert('savings_transactions', [
      ...held.map(c => ({ goal_id: g.id, goal_category_id: c.id, amount: -c.reserved, date: state.today, type: 'reallocation', notes, pair_id: pair })),
      { goal_id: g.id, goal_category_id: null, amount: total, date: state.today, type: 'reallocation', notes, pair_id: pair },
    ])
  }
  if (clearPaidBefore) {
    for (const c of data.value.categories.filter(c => c.paid_before > 0)) await update('goal_categories', c.id, { paid_before: 0 })
  }
  return total
}
