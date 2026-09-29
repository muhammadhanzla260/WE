<script setup>
import { ref, reactive, computed } from 'vue'
import Modal from './Modal.vue'
import MoneyInput from './MoneyInput.vue'
import { metrics as m, saveCategory, deleteCategory, allocateUnallocated, reallocate, resetFunding, state } from '../store.js'
import { PRIORITIES } from '../lib/defaults.js'
import { pkr, pct } from '../lib/format.js'
import { dateLabel } from '../lib/dates.js'
import { toast, openEntry } from '../ui.js'

const editing = ref(null)
const moving = ref(null)
const error = ref('')
const filter = ref('all')

const list = computed(() => m.value.categories.filter(c => filter.value === 'all' || c.priority === filter.value))
const totals = computed(() => {
  const cs = m.value.categories
  const s = f => cs.reduce((a, c) => a + f(c), 0)
  return { target: s(c => c.target_amount), contributed: s(c => c.contributed), spent: s(c => c.spent), reserved: s(c => c.reserved) + m.value.unallocated.reserved }
})

function edit(c = null) {
  error.value = ''
  editing.value = reactive(c
    ? { ...c, paid_total: c.spent }
    : { name: '', target_amount: null, paid_total: 0, recordedSpent: 0, priority: 'important', deadline: '', notes: '', is_contingency: false })
}

async function save() {
  const c = editing.value
  if (!c.name.trim()) return (error.value = 'Give the category a name.')
  if (!(c.target_amount >= 0)) return (error.value = 'Enter a target amount.')
  // "Already paid" = recorded wedding expenses + payments made before using the app.
  const paid = c.paid_total || 0
  if (paid < c.recordedSpent - 0.5) return (error.value = `${pkr(c.recordedSpent)} is recorded as wedding expenses here. To go lower, edit or delete those expenses in Transactions.`)
  const before = m.value.required
  await saveCategory({ ...c, name: c.name.trim(), paid_before: Math.max(0, paid - c.recordedSpent) })
  editing.value = null
  const diff = m.value.required - before
  toast(Math.abs(diff) >= 1 ? `Saved. Monthly requirement ${diff > 0 ? 'up' : 'down'} ${pkr(Math.abs(diff))}.` : 'Category saved.')
}

async function del(c) {
  const note = c.reserved > 0 ? ` Its ${pkr(c.reserved)} of savings will move to Unallocated.` : ''
  if (!confirm(`Delete "${c.name}"?${note}`)) return
  await deleteCategory(c.id)
  editing.value = null
  toast('Category deleted.')
}

// Accept a suggested cut: lower the category's target by the amount.
async function applyCut(cut) {
  const c = m.value.categories.find(x => x.id === cut.id)
  await saveCategory({ ...c, target_amount: Math.max(c.contributed, c.target_amount - Math.round(cut.cut)) })
  toast(`${c.name} target reduced.`)
}

function move(from = null) {
  error.value = ''
  if (!from && !sources.value.length) return toast('Nothing is saved yet. Add savings first.')
  moving.value = reactive({ from: from ? from.id : sources.value[0].id, to: '', amount: null })
}
const sources = computed(() => [m.value.unallocated, ...m.value.categories].filter(c => c.reserved > 0.5))
async function doMove() {
  const mv = moving.value
  const src = [m.value.unallocated, ...m.value.categories].find(c => c.id === mv.from)
  if (mv.to === '' || mv.to === mv.from) return (error.value = 'Choose a different destination.')
  if (!(mv.amount > 0)) return (error.value = 'Enter an amount.')
  if (mv.amount > src.reserved + 0.5) return (error.value = `${src.name} only holds ${pkr(src.reserved)}.`)
  await reallocate(mv.from, mv.to || null, mv.amount, state.today, 'Moved between categories')
  moving.value = null
  toast('Money moved.')
}
const resetting = ref(null)
const priorPaid = computed(() => m.value.categories.reduce((s, c) => s + (Number(c.paid_before) || 0), 0))
const heldTotal = computed(() => m.value.categories.reduce((s, c) => s + Math.max(0, c.reserved), 0))
async function doReset() {
  const moved = await resetFunding({ clearPaidBefore: resetting.value.clearPaidBefore })
  resetting.value = null
  toast(moved > 0 ? `${pkr(moved)} returned to Unallocated. Undo it from Transactions if needed.` : 'Funding reset.')
}

async function allocate() {
  if (!confirm(`Split ${pkr(m.value.unallocated.reserved)} of unallocated savings across categories (critical first)? This marks those categories as funded.`)) return
  const moved = await allocateUnallocated()
  toast(moved ? `${pkr(moved)} allocated by priority.` : 'Every category is already covered.')
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Wedding categories</h1>
        <p>Each category keeps its own target, savings and payments. Changing a target updates the whole plan.</p>
      </div>
      <div class="row wrap">
        <button class="btn" @click="resetting = reactive({ clearPaidBefore: false })">↺ Reset funding</button>
        <button class="btn" @click="move()">⇄ Move money</button>
        <button class="btn primary" @click="edit()">＋ Category</button>
      </div>
    </div>

    <div class="grid g4">
      <section class="card stat"><div class="label">Total target</div><div class="value num">{{ pkr(totals.target) }}</div></section>
      <section class="card stat"><div class="label">Saved toward it</div><div class="value num">{{ pkr(totals.contributed + m.unallocated.contributed) }}</div></section>
      <section class="card stat"><div class="label">Already paid</div><div class="value num">{{ pkr(totals.spent) }}</div></section>
      <section class="card stat"><div class="label">Reserved (held)</div><div class="value num">{{ pkr(totals.reserved) }}</div></section>
    </div>

    <section v-if="m.cuts?.cuts.length" class="callout red mt">
      <h3>Plan is {{ pkr(m.shortage) }} short. Trim optional categories first</h3>
      <p class="small" style="margin-top:4px">Critical categories are never suggested. Lowering a target reduces the monthly requirement straight away.</p>
      <div class="stack mt" style="gap:8px">
        <div v-for="c in m.cuts.cuts" :key="c.id" class="row between wrap">
          <span>{{ c.name }} <span class="faint">({{ c.priority }})</span>: reduce by <strong class="num">{{ pkr(c.cut) }}</strong></span>
          <button class="btn sm" @click="applyCut(c)">Apply</button>
        </div>
      </div>
      <p v-if="m.cuts.uncovered > 0" class="small mt">Even after these, {{ pkr(m.cuts.uncovered) }} would remain uncovered. Saving more per month is needed.</p>
    </section>

    <div v-if="m.unallocated.reserved > 0.5" class="callout row between wrap mt">
      <span><strong class="num">{{ pkr(m.unallocated.reserved) }}</strong> is saved but unallocated.</span>
      <span class="row"><button class="btn sm" @click="move(m.unallocated)">Assign manually</button><button class="btn sm primary" @click="allocate">Allocate by priority</button></span>
    </div>

    <div class="row between wrap mt">
      <div class="tabs" role="tablist">
        <button v-for="f in ['all', 'critical', 'important', 'optional']" :key="f" :class="{ on: filter === f }" @click="filter = f">{{ f === 'all' ? 'All' : PRIORITIES[f].label }}</button>
      </div>
      <span class="faint">Grey part of each bar = already paid</span>
    </div>

    <div class="grid g2 mt">
      <section v-for="c in list" :key="c.id" class="card">
        <div class="row between" style="align-items:flex-start">
          <div>
            <h3>{{ c.name }} <span v-if="c.is_contingency" class="pill neutral" style="margin-left:4px">Contingency</span></h3>
            <p class="faint">{{ PRIORITIES[c.priority]?.label }} · {{ PRIORITIES[c.priority]?.hint }}<template v-if="c.deadline"> · due {{ dateLabel(c.deadline) }}</template></p>
          </div>
          <div class="row" style="gap:2px">
            <button class="icon-btn" title="Record a payment" @click="openEntry('expense', null, { expense_type: 'wedding', goal_category_id: c.id })">₨</button>
            <button class="icon-btn" title="Edit" @click="edit(c)">✎</button>
          </div>
        </div>
        <div class="bar lg mt" :title="`${pct(c.progress)} funded`">
          <span :style="{ width: pct(Math.min(1, c.progress)), background: c.status === 'funded' ? 'var(--good)' : c.status === 'behind' ? 'var(--warn)' : '' }"></span>
          <span class="spent" :style="{ width: pct(c.target_amount > 0 ? Math.min(1, c.spent / c.target_amount) : 0) }"></span>
        </div>
        <table class="t mt small">
          <tbody>
            <tr><td class="muted">Target</td><td class="r num">{{ pkr(c.target_amount) }}</td><td class="muted">Funded</td><td class="r num"><strong>{{ pct(c.progress) }}</strong></td></tr>
            <tr><td class="muted">Allocated (held)</td><td class="r num">{{ pkr(c.reserved) }}</td><td class="muted">Already paid</td><td class="r num">{{ pkr(c.spent) }}</td></tr>
            <tr><td class="muted">Still required</td><td class="r num"><strong>{{ pkr(c.remaining) }}</strong></td><td class="muted">Status</td><td class="r"><span class="pill" :class="{ funded: 'green', 'on-track': 'neutral', behind: 'yellow' }[c.status]">{{ c.status === 'on-track' ? 'on track' : c.status }}</span></td></tr>
          </tbody>
        </table>
        <p v-if="c.paid_before > 0" class="faint mt">Paid includes {{ pkr(c.paid_before) }} paid before using the app.</p>
        <p v-if="c.overspent" class="error mt">Paid {{ pkr(c.overspent) }} more than this category's target.</p>
        <p v-if="c.notes" class="faint mt">{{ c.notes }}</p>
      </section>
    </div>

    <Modal v-if="editing" :title="editing.id ? 'Edit category' : 'New category'" eyebrow="Wedding category" @close="editing = null">
      <form @submit.prevent="save">
        <div class="form">
          <div class="field wide"><label for="c_name">Name</label><input id="c_name" v-model="editing.name" class="input" autofocus /></div>
          <div class="field"><label for="c_target">Target amount</label><MoneyInput id="c_target" v-model="editing.target_amount" /></div>
          <div class="field"><label for="c_paid">Already paid</label><MoneyInput id="c_paid" v-model="editing.paid_total" placeholder="0" />
            <span class="hint">
              <template v-if="editing.recordedSpent > 0">Includes {{ pkr(editing.recordedSpent) }} from recorded expenses. </template>Anything above that counts as paid before you started using the app (e.g. an advance).
            </span>
          </div>
          <div class="field"><label for="c_pri">Priority</label>
            <select id="c_pri" v-model="editing.priority" class="input"><option v-for="(p, k) in PRIORITIES" :key="k" :value="k">{{ p.label }}: {{ p.hint }}</option></select>
          </div>
          <div class="field"><label for="c_dl">Deadline (optional)</label><input id="c_dl" v-model="editing.deadline" type="date" class="input" /><span class="hint">When this needs to be fully funded, e.g. hall booking date.</span></div>
          <div class="field" style="justify-content:center"><label class="check"><input v-model="editing.is_contingency" type="checkbox" /> <span>Emergency / contingency buffer</span></label></div>
          <div class="field wide"><label for="c_notes">Notes</label><textarea id="c_notes" v-model="editing.notes" class="input" placeholder="Quotes received, vendor, etc."></textarea></div>
        </div>
        <p v-if="error" class="error mt">{{ error }}</p>
        <div class="form-actions">
          <button v-if="editing.id" type="button" class="btn danger ghost" style="margin-right:auto" @click="del(editing)">Delete</button>
          <button type="button" class="btn ghost" @click="editing = null">Cancel</button>
          <button class="btn primary">Save</button>
        </div>
      </form>
    </Modal>

    <Modal v-if="resetting" title="Reset category funding" eyebrow="Categories" @close="resetting = null">
      <form @submit.prevent="doReset">
        <p>This moves <strong class="num">{{ pkr(heldTotal) }}</strong> held in categories back to <strong>Unallocated</strong>, so every category's funding starts again from zero.</p>
        <ul class="small muted">
          <li>Your total savings stay the same. Only the category assignment is cleared.</li>
          <li>Recorded wedding payments still count as paid.</li>
          <li>You can reassign afterwards with "Allocate by priority" or "Move money", or undo the reset in Transactions (↺).</li>
        </ul>
        <label v-if="priorPaid > 0" class="check mt">
          <input v-model="resetting.clearPaidBefore" type="checkbox" />
          <span>Also clear the <span class="num">{{ pkr(priorPaid) }}</span> entered as paid before using the app <span class="faint">(this part can't be undone)</span></span>
        </label>
        <div class="form-actions"><button type="button" class="btn ghost" @click="resetting = null">Cancel</button><button class="btn primary">Reset funding</button></div>
      </form>
    </Modal>

    <Modal v-if="moving"title="Move money between categories" eyebrow="Reallocate" @close="moving = null">
      <form @submit.prevent="doMove">
        <div class="form">
          <div class="field"><label for="mv_from">From</label>
            <select id="mv_from" v-model="moving.from" class="input">
              <option v-for="c in sources" :key="c.id ?? 'u'" :value="c.id">{{ c.name }} ({{ pkr(c.reserved) }})</option>
            </select>
          </div>
          <div class="field"><label for="mv_to">To</label>
            <select id="mv_to" v-model="moving.to" class="input">
              <option value="" disabled>Choose…</option>
              <option v-if="moving.from !== null" :value="null">Unallocated</option>
              <option v-for="c in m.categories.filter(c => c.id !== moving.from)" :key="c.id" :value="c.id">{{ c.name }} (needs {{ pkr(c.remaining) }})</option>
            </select>
          </div>
          <div class="field wide"><label for="mv_amt">Amount</label><MoneyInput id="mv_amt" v-model="moving.amount" /></div>
        </div>
        <p class="faint mt">Total savings stay the same. Only the category they belong to changes.</p>
        <p v-if="error" class="error mt">{{ error }}</p>
        <div class="form-actions"><button type="button" class="btn ghost" @click="moving = null">Cancel</button><button class="btn primary">Move</button></div>
      </form>
    </Modal>
  </div>
</template>
