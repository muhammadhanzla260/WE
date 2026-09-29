<script setup>
import { reactive, ref, computed } from 'vue'
import Modal from './Modal.vue'
import MoneyInput from './MoneyInput.vue'
import StatusPill from './StatusPill.vue'
import { metrics as m, data, state, saveIncome, saveExpense, addSavings, withdrawSavings, deleteTransaction, updateSavingsRow } from '../store.js'
import { simulatePurchase } from '../lib/engine.js'
import { INCOME_TYPES, EXPENSE_TYPES } from '../lib/defaults.js'
import { pkr } from '../lib/format.js'
import { ui, toast } from '../ui.js'

const { kind: initialKind, row, preset } = ui.entry
const editing = !!row
const kind = ref(initialKind)
const error = ref('')
const busy = ref(false)

const f = reactive({
  amount: row ? Math.abs(row.amount) : preset.amount ?? null,
  date: row?.date || state.today,
  description: row?.description ?? row?.notes ?? preset.description ?? '',
  income_type: row?.income_type || 'Salary',
  expense_type: row?.expense_type || preset.expense_type || 'essential',
  expense_category: row?.expense_category || 'Groceries',
  goal_category_id: row?.goal_category_id ?? preset.goal_category_id ?? (kind.value === 'savings' && !editing ? 'auto' : null),
  funded_from: row?.funded_from || 'reserve',
  coverFromBuffer: true,
})
if (kind.value === 'expense' && !row && f.expense_type !== 'wedding') f.expense_category = EXPENSE_TYPES[f.expense_type].categories[0]

const titles = { income: 'Add income', expense: 'Add expense', savings: 'Add wedding savings', withdraw: 'Take money out of wedding savings' }
const title = computed(() => (editing ? titles[kind.value].replace(/^Add|^Take/, 'Edit') : titles[kind.value]))
const cats = computed(() => m.value.categories)
const wedding = computed(() => kind.value === 'expense' && f.expense_type === 'wedding')
const selectedCat = computed(() => cats.value.find(c => c.id === f.goal_category_id))
const buffer = computed(() => cats.value.find(c => c.is_contingency))

function switchKind(k) {
  kind.value = k
  if (k === 'savings' && !f.goal_category_id) f.goal_category_id = 'auto'
  if (k === 'expense' && f.expense_type === 'wedding' && (!f.goal_category_id || f.goal_category_id === 'auto')) f.goal_category_id = cats.value[0]?.id ?? null
}

function setType(t) {
  f.expense_type = t
  if (t !== 'wedding') f.expense_category = EXPENSE_TYPES[t].categories[0]
  else if (!f.goal_category_id) f.goal_category_id = cats.value[0]?.id ?? null
}

// Live feedback while typing a lifestyle expense: what it does to the plan (§9).
const impact = computed(() => {
  if (kind.value !== 'expense' || f.expense_type === 'wedding' || !(f.amount > 0) || editing) return null
  if (f.date.slice(0, 7) !== state.today.slice(0, 7)) return null
  if (f.expense_type === 'lifestyle') return simulatePurchase(data.value, state.today, f.amount)
  return null
})

// Paying a wedding cost from savings: is there enough held in that category?
const overrun = computed(() => {
  if (!wedding.value || f.funded_from !== 'reserve' || !selectedCat.value || !(f.amount > 0)) return 0
  const held = selectedCat.value.reserved + (editing && row.goal_category_id === selectedCat.value.id ? Math.abs(row.amount) : 0)
  return Math.max(0, f.amount - held)
})
const bufferCover = computed(() => (buffer.value && selectedCat.value && !selectedCat.value.is_contingency ? Math.min(overrun.value, Math.max(0, buffer.value.reserved)) : 0))

async function submit() {
  error.value = ''
  if (!(f.amount > 0)) return (error.value = 'Enter an amount greater than zero.')
  if (!f.date) return (error.value = 'Pick a date.')
  busy.value = true
  try {
    if (kind.value === 'income') {
      await saveIncome({ id: row?.id, amount: f.amount, income_type: f.income_type, date: f.date, description: f.description })
      toast('Income added.')
    } else if (kind.value === 'expense') {
      if (wedding.value && !f.goal_category_id) throw new Error('Choose which wedding category this is for.')
      const cover = wedding.value && f.coverFromBuffer ? bufferCover.value : 0
      await saveExpense({ ...f, id: row?.id }, { coverFromBuffer: cover })
      toast(cover ? `Expense saved. ${pkr(cover)} moved from ${buffer.value.name}.` : 'Expense saved.')
    } else if (editing) {
      // Editing an existing savings row keeps its sign.
      const sign = row.amount < 0 ? -1 : 1
      await updateSavingsRow(row.id, { amount: sign * f.amount, date: f.date, notes: f.description, goal_category_id: f.goal_category_id === 'auto' ? null : f.goal_category_id })
      toast('Savings entry updated.')
    } else if (kind.value === 'savings') {
      await addSavings({ amount: f.amount, date: f.date, categoryId: f.goal_category_id, notes: f.description })
      toast(`${pkr(f.amount)} added to the wedding fund.`)
    } else {
      const src = f.goal_category_id ? selectedCat.value : m.value.unallocated
      if (f.amount > src.reserved + 0.5) throw new Error(`${src.name} only holds ${pkr(src.reserved)}.`)
      await withdrawSavings({ amount: f.amount, date: f.date, categoryId: f.goal_category_id, notes: f.description })
      toast('Withdrawal recorded. Your savings total went down.')
    }
    ui.entry = null
  } catch (e) {
    error.value = e.message
  }
  busy.value = false
}

async function del() {
  if (!confirm('Delete this entry?')) return
  const table = kind.value === 'income' ? 'income' : kind.value === 'expense' ? 'expenses' : 'savings_transactions'
  await deleteTransaction(table, row)
  ui.entry = null
  toast('Entry deleted.')
}
</script>

<template>
  <Modal :title="title" eyebrow="Record" @close="ui.entry = null">
    <div v-if="!editing" class="tabs" style="margin-bottom:16px">
      <button v-for="k in ['income', 'savings', 'expense']" :key="k" :class="{ on: kind === k }" type="button" @click="switchKind(k)">
        {{ { income: '＋ Income', savings: '＋ Savings', expense: '− Expense' }[k] }}
      </button>
    </div>

    <form @submit.prevent="submit">
      <div class="form">
        <div class="field"><label for="e_amt">Amount</label><MoneyInput id="e_amt" v-model="f.amount" autofocus /></div>
        <div class="field"><label for="e_date">Date</label><input id="e_date" v-model="f.date" type="date" class="input" /></div>

        <template v-if="kind === 'income'">
          <div class="field wide"><label for="e_it">Income type</label>
            <select id="e_it" v-model="f.income_type" class="input"><option v-for="t in INCOME_TYPES" :key="t">{{ t }}</option></select>
          </div>
        </template>

        <template v-if="kind === 'expense'">
          <div class="field wide"><label>Expense type</label>
            <div class="tabs">
              <button v-for="(t, k) in EXPENSE_TYPES" :key="k" type="button" :class="{ on: f.expense_type === k }" @click="setType(k)">{{ t.label }}</button>
            </div>
          </div>
          <div v-if="!wedding" class="field wide"><label for="e_cat">Category</label>
            <select id="e_cat" v-model="f.expense_category" class="input">
              <option v-for="c in [...new Set([...EXPENSE_TYPES[f.expense_type].categories, f.expense_category])]" :key="c">{{ c }}</option>
            </select>
          </div>
          <template v-else>
            <div class="field wide"><label for="e_wc">Wedding category</label>
              <select id="e_wc" v-model="f.goal_category_id" class="input">
                <option v-for="c in cats" :key="c.id" :value="c.id">{{ c.name }} (held {{ pkr(c.reserved) }})</option>
              </select>
            </div>
            <div class="field wide"><label>Paid from</label>
              <label class="check"><input v-model="f.funded_from" type="radio" value="reserve" /> <span>Wedding savings already set aside <span class="faint">(reduces what's held)</span></span></label>
              <label class="check"><input v-model="f.funded_from" type="radio" value="income" /> <span>This month's income <span class="faint">(counts as saving and spending at once)</span></span></label>
            </div>
          </template>
        </template>

        <template v-if="kind === 'savings' || kind === 'withdraw'">
          <div class="field wide"><label for="e_sc">{{ kind === 'savings' ? 'Put it toward' : 'Take it from' }}</label>
            <select id="e_sc" v-model="f.goal_category_id" class="input">
              <option v-if="kind === 'savings' && !editing" value="auto">Auto: fill critical categories first</option>
              <option :value="null">Unallocated ({{ pkr(m.unallocated.reserved) }})</option>
              <option v-for="c in cats" :key="c.id" :value="c.id">{{ c.name }}: {{ kind === 'savings' ? `needs ${pkr(c.remaining)}` : `holds ${pkr(c.reserved)}` }}</option>
            </select>
          </div>
        </template>

        <div class="field wide"><label for="e_desc">{{ kind === 'savings' || kind === 'withdraw' ? 'Notes' : 'Description' }}</label><input id="e_desc" v-model="f.description" class="input" placeholder="Optional" /></div>
      </div>

      <!-- Feedback before saving -->
      <div v-if="kind === 'savings' && !editing && m.stillToSaveThisMonth > 0" class="callout mt small">
        This month still needs <strong class="num">{{ pkr(m.stillToSaveThisMonth) }}</strong> of the <span class="num">{{ pkr(m.required) }}</span> requirement.
      </div>
      <div v-if="impact" class="callout mt small" :class="impact.status">
        <div class="row between wrap"><strong>After this purchase</strong><StatusPill :status="impact.status" text="" /></div>
        <p style="margin-top:4px">
          Safe to spend left this month: <strong class="num">{{ pkr(impact.discretionaryAfter) }}</strong>.
          <template v-if="impact.reducesSaving"> This cuts <strong class="num">{{ pkr(impact.savingLost) }}</strong> from wedding saving.</template>
          <template v-if="impact.exceedsFreeCash"> It's more than your free cash, so it would dip into wedding money.</template>
        </p>
      </div>
      <div v-if="overrun > 0" class="callout yellow mt small">
        {{ selectedCat.name }} only holds <strong class="num">{{ pkr(selectedCat.reserved) }}</strong>; this is <strong class="num">{{ pkr(overrun) }}</strong> more.
        <label v-if="bufferCover > 0" class="check mt"><input v-model="f.coverFromBuffer" type="checkbox" /> <span>Cover <span class="num">{{ pkr(bufferCover) }}</span> from {{ buffer.name }} (contingency)</span></label>
      </div>

      <p v-if="error" class="error mt">{{ error }}</p>
      <div class="form-actions">
        <button v-if="editing" type="button" class="btn danger ghost" style="margin-right:auto" @click="del">Delete</button>
        <button type="button" class="btn ghost" @click="ui.entry = null">Cancel</button>
        <button class="btn primary" :disabled="busy">{{ editing ? 'Save changes' : 'Save' }}</button>
      </div>
    </form>
  </Modal>
</template>
