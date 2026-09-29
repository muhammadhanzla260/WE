<script setup>
import { ref, computed } from 'vue'
import { state, data, deleteTransaction } from '../store.js'
import { pkr } from '../lib/format.js'
import { dateLabel, monthLabel } from '../lib/dates.js'
import { EXPENSE_TYPES } from '../lib/defaults.js'
import { ui, openEntry, toast } from '../ui.js'

const filter = ref('all')
const month = ref(state.today.slice(0, 7))
const q = ref('')

const catName = id => (id ? data.value.categories.find(c => c.id === id)?.name || 'Deleted category' : 'Unallocated')

// One list across the three transaction tables.
const all = computed(() => {
  const rows = []
  for (const r of state.db.income) rows.push({ kind: 'income', table: 'income', row: r, title: r.description || r.income_type, sub: r.income_type, amount: r.amount })
  for (const r of state.db.expenses) {
    rows.push({
      kind: 'expense', table: 'expenses', row: r, amount: -r.amount,
      title: r.description || r.expense_category,
      sub: `${EXPENSE_TYPES[r.expense_type]?.label} · ${r.expense_category}${r.expense_type === 'wedding' ? (r.funded_from === 'income' ? ' · paid from income' : ' · paid from savings') : ''}`,
    })
  }
  for (const r of data.value.savings) {
    const label = { opening: 'Opening wedding savings', deposit: 'Saved', withdrawal: 'Withdrawn from savings', reallocation: r.amount < 0 ? 'Moved out' : 'Moved in' }[r.type] || 'Savings'
    rows.push({ kind: 'savings', table: 'savings_transactions', row: r, title: r.notes || label, sub: `${label} · ${catName(r.goal_category_id)}`, amount: r.amount, internal: r.type === 'reallocation' })
  }
  return rows.sort((a, b) => b.row.date.localeCompare(a.row.date) || (b.row.created_at || '').localeCompare(a.row.created_at || ''))
})

const months = computed(() => [...new Set([state.today.slice(0, 7), ...all.value.map(r => r.row.date.slice(0, 7))])].sort().reverse())

const list = computed(() => {
  const s = q.value.trim().toLowerCase()
  return all.value.filter(r =>
    (filter.value === 'all' || r.kind === filter.value) &&
    (month.value === 'all' || r.row.date.startsWith(month.value)) &&
    (!s || `${r.title} ${r.sub} ${r.row.date}`.toLowerCase().includes(s)))
})

const totals = computed(() => {
  const t = { income: 0, expense: 0, savings: 0 }
  for (const r of list.value) if (!r.internal) t[r.kind] += r.amount
  return t
})

function edit(r) {
  if (r.internal) {
    if (confirm('Undo this move between categories? Both sides will be removed.')) deleteTransaction(r.table, r.row).then(() => toast('Move undone.'))
    return
  }
  const kind = r.kind === 'savings' ? (r.row.amount < 0 ? 'withdraw' : 'savings') : r.kind
  openEntry(kind, r.row)
}

function exportCsv() {
  const rows = [['Date', 'Kind', 'Description', 'Details', 'Amount (PKR)'], ...list.value.map(r => [r.row.date, r.kind, r.title, r.sub, r.amount])]
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  a.download = `wedding-fund-${month.value}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Transactions</h1><p>Everything you've recorded. Tap a row to edit it.</p></div>
      <div class="row wrap">
        <button class="btn" @click="ui.ledgerImport = true">⇩ From Studio Ledger</button>
        <button class="btn" @click="exportCsv">⇩ CSV</button>
        <button class="btn primary" @click="openEntry('expense')">＋ Add</button>
      </div>
    </div>

    <div class="row between wrap">
      <div class="tabs">
        <button v-for="f in ['all', 'income', 'expense', 'savings']" :key="f" :class="{ on: filter === f }" @click="filter = f">{{ { all: 'All', income: 'Income', expense: 'Expenses', savings: 'Savings' }[f] }}</button>
      </div>
      <div class="row wrap">
        <select v-model="month" class="input" style="width:auto" aria-label="Month">
          <option value="all">All months</option>
          <option v-for="k in months" :key="k" :value="k">{{ monthLabel(k, 'long') }}</option>
        </select>
        <input v-model="q" class="input" type="search" placeholder="Search" style="width:180px" aria-label="Search transactions" />
      </div>
    </div>

    <div class="grid g3 mt">
      <section class="card stat"><div class="label">Income</div><div class="value num" style="font-size:20px">{{ pkr(totals.income) }}</div></section>
      <section class="card stat"><div class="label">Expenses</div><div class="value num" style="font-size:20px">{{ pkr(-totals.expense) }}</div></section>
      <section class="card stat"><div class="label">Net saved to wedding</div><div class="value num" style="font-size:20px">{{ pkr(totals.savings) }}</div></section>
    </div>

    <section class="card mt">
      <div v-if="!list.length" class="empty"><strong>Nothing here yet</strong>Record income, savings or an expense with the buttons above.</div>
      <div v-else class="table-wrap">
        <table class="t">
          <thead><tr><th>Date</th><th>Description</th><th class="r">Amount</th><th></th></tr></thead>
          <tbody>
            <tr v-for="r in list" :key="r.row.id" style="cursor:pointer" @click="edit(r)">
              <td class="num muted small">{{ dateLabel(r.row.date) }}</td>
              <td><strong>{{ r.title }}</strong><div class="faint">{{ r.sub }}</div></td>
              <td class="r num" :style="{ color: r.internal ? 'var(--ink-3)' : r.kind === 'expense' ? 'var(--bad-ink)' : r.kind === 'income' ? 'var(--good-ink)' : 'var(--accent)' }">
                {{ r.amount < 0 ? '−' : '+' }} {{ pkr(Math.abs(r.amount)) }}
              </td>
              <td class="r"><span class="icon-btn" :title="r.internal ? 'Undo move' : 'Edit'">{{ r.internal ? '↺' : '✎' }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
