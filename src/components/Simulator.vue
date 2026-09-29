<script setup>
import { ref, computed } from 'vue'
import MoneyInput from './MoneyInput.vue'
import StatusPill from './StatusPill.vue'
import { data, state, metrics as m, goal } from '../store.js'
import { simulatePurchase } from '../lib/engine.js'
import { pkr, signedPkr } from '../lib/format.js'
import { monthLabel, monthKey } from '../lib/dates.js'
import { openEntry } from '../ui.js'

const amount = ref(null)
const what = ref('')
const r = computed(() => (amount.value > 0 ? simulatePurchase(data.value, state.today, amount.value) : null))
const weddingMonth = computed(() => monthLabel(monthKey(goal.value.target_date), 'long'))

const verdict = computed(() => {
  const x = r.value
  if (!x) return ''
  if (x.exceedsFreeCash) return 'No. This is more than your free cash, so it would be paid with wedding money.'
  if (x.status === 'red') return `Not safe. This puts the ${weddingMonth.value} target at risk.`
  if (x.status === 'yellow') return 'Affordable, but it uses most of this month\'s discretionary budget.'
  return 'Yes. This fits your discretionary budget and doesn\'t reduce wedding saving.'
})
</script>

<template>
  <div class="page" style="max-width:820px">
    <div class="page-head">
      <div><h1>Can I afford this?</h1><p>Check a purchase against the wedding plan before you make it.</p></div>
    </div>

    <section class="card">
      <div class="form">
        <div class="field"><label for="sim_amt">Purchase amount</label><MoneyInput id="sim_amt" v-model="amount" autofocus placeholder="e.g. 80,000" /></div>
        <div class="field"><label for="sim_what">What is it? (optional)</label><input id="sim_what" v-model="what" class="input" placeholder="New phone, trip…" /></div>
      </div>
      <p class="faint mt">Treated as a lifestyle expense this month. Current discretionary balance: <strong class="num">{{ pkr(m.util.remaining) }}</strong> · free cash: <strong class="num">{{ pkr(m.freeCash) }}</strong></p>
    </section>

    <section v-if="r" class="callout mt" :class="r.status">
      <div class="row between wrap"><h2>{{ verdict }}</h2><StatusPill :status="r.status" /></div>
      <table class="t mt" style="background:transparent">
        <tbody>
          <tr><td>Current discretionary balance</td><td class="r num">{{ pkr(r.discretionaryBefore) }}</td></tr>
          <tr><td>Proposed purchase{{ what ? ` (${what})` : '' }}</td><td class="r num">− {{ pkr(r.amount) }}</td></tr>
          <tr><td><strong>Remaining this month</strong></td><td class="r num"><strong>{{ r.discretionaryAfter < 0 ? '−' : '' }}{{ pkr(Math.abs(r.discretionaryAfter)) }}</strong></td></tr>
          <tr v-if="r.reducesSaving"><td>Wedding saving lost this month</td><td class="r num">{{ pkr(r.savingLost) }}</td></tr>
          <tr><td>Projected {{ weddingMonth }} savings after purchase</td><td class="r num">{{ pkr(r.after.projected) }}</td></tr>
          <tr><td>Wedding trajectory after purchase</td><td class="r num"><strong>{{ r.trajectoryDiff >= -1 ? 'On track' : `${pkr(-r.trajectoryDiff)} behind` }}</strong></td></tr>
          <tr v-if="r.after.adjustmentPerMonth > 0"><td>Extra saving needed per month to recover</td><td class="r num">{{ pkr(r.after.adjustmentPerMonth) }}</td></tr>
          <tr><td>Free cash after purchase</td><td class="r num">{{ signedPkr(r.before.freeCash - r.amount) }}</td></tr>
        </tbody>
      </table>
      <ul v-if="r.after.risk.reasons.length" class="small">
        <li v-for="x in r.after.risk.reasons" :key="x">{{ x }}</li>
      </ul>
      <div class="row mt" style="justify-content:flex-end">
        <button class="btn sm" @click="openEntry('expense', null, { expense_type: 'lifestyle', amount, description: what })">I bought it: record the expense</button>
      </div>
    </section>
  </div>
</template>
