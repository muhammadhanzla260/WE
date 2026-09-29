<script setup>
import { ref, computed, watch } from 'vue'
import StatusPill from './StatusPill.vue'
import MoneyInput from './MoneyInput.vue'
import ForecastChart from './ForecastChart.vue'
import { metrics as m, history, data, state, saveMonthBudget, goal } from '../store.js'
import { budgetFor, monthFlows } from '../lib/engine.js'
import { pkr, signedPkr, pct } from '../lib/format.js'
import { monthLabel, monthKey } from '../lib/dates.js'
import { toast } from '../ui.js'

const cur = computed(() => monthKey(state.today))
const u = computed(() => m.value.util)
const f = computed(() => u.value.flows)

// Editable budget for the current month.
const income = ref(null)
const essential = ref(null)
watch(() => budgetFor(data.value, cur.value), b => { income.value = b.expected_income; essential.value = b.essential_budget }, { immediate: true })
async function saveBudget() {
  await saveMonthBudget(cur.value, { expected_income: income.value || 0, essential_budget: essential.value || 0 })
  toast('Budget for this month updated.')
}

// Monthly review (§13): default to the last completed month when there is one.
const reviewMonth = ref(history.value.length > 1 ? history.value[history.value.length - 2].month : cur.value)
const review = computed(() => history.value.find(h => h.month === reviewMonth.value) || history.value[history.value.length - 1])
const reviewFlows = computed(() => monthFlows(data.value, review.value.month))
const reviewNote = computed(() => ({ green: 'Successful month', yellow: 'Slightly short', red: 'Missed the requirement' })[review.value.status])
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Month &amp; forecast</h1><p>{{ monthLabel(cur, 'long') }} budget, the monthly review, and where you'll land by the wedding.</p></div>
    </div>

    <div class="grid g2">
      <!-- Monthly money equation (§7) -->
      <section class="card">
        <div class="card-head"><div><h2>This month's money equation</h2><p>Income − Essentials − Wedding saving = Safe discretionary budget</p></div></div>
        <form class="form" @submit.prevent="saveBudget">
          <div class="field"><label for="b_inc">Expected income</label><MoneyInput id="b_inc" v-model="income" /></div>
          <div class="field"><label for="b_ess">Essential budget</label><MoneyInput id="b_ess" v-model="essential" /></div>
          <div class="field wide" style="flex-direction:row;justify-content:flex-end"><button class="btn sm primary">Update this month</button></div>
        </form>
        <table class="t mt">
          <tbody>
            <tr><td>Expected income</td><td class="r num">{{ pkr(u.expected_income) }}</td></tr>
            <tr><td>− Essential expenses</td><td class="r num">{{ pkr(u.essential_budget) }}</td></tr>
            <tr><td>− Required wedding saving</td><td class="r num">{{ pkr(u.required) }}</td></tr>
            <tr><td><strong>= Safe discretionary budget</strong></td><td class="r num"><strong :style="{ color: u.allowance < 0 ? 'var(--bad-ink)' : '' }">{{ pkr(u.allowance) }}</strong></td></tr>
          </tbody>
        </table>
        <p v-if="u.allowance < 0" class="error mt">Income can't cover essentials plus the required saving. Raise income, trim essentials, or lower category targets.</p>
      </section>

      <section class="card">
        <div class="card-head"><div><h2>So far in {{ monthLabel(cur, 'long') }}</h2><p>Actuals recorded this month</p></div></div>
        <table class="t">
          <tbody>
            <tr><td>Income received</td><td class="r num">{{ pkr(f.income) }}</td><td class="r faint">of {{ pkr(u.expected_income) }}</td></tr>
            <tr><td>Essential spent</td><td class="r num">{{ pkr(f.essential) }}</td><td class="r faint">of {{ pkr(u.essential_budget) }}</td></tr>
            <tr><td>Lifestyle spent</td><td class="r num">{{ pkr(f.lifestyle) }}</td><td class="r faint">{{ pct(Number.isFinite(u.usage) ? u.usage : 1) }} of allowance</td></tr>
            <tr><td>Wedding payments</td><td class="r num">{{ pkr(f.wedding) }}</td><td></td></tr>
            <tr><td>Saved to wedding</td><td class="r num"><strong>{{ pkr(f.saved) }}</strong></td><td class="r faint">of {{ pkr(u.required) }}</td></tr>
          </tbody>
        </table>
        <p v-if="u.essentialOverrun > 0" class="small mt" style="color:var(--warn-ink)">Essentials are {{ pkr(u.essentialOverrun) }} over budget. That comes out of the discretionary allowance.</p>
      </section>
    </div>

    <!-- Forecast (§10) -->
    <section class="card mt">
      <div class="card-head">
        <div><h2>Forecast to the wedding</h2><p>Projected = current savings + expected future monthly saving</p></div>
        <StatusPill :status="m.projectedDiff >= -1 ? 'green' : 'red'" :text="m.projectedDiff >= -1 ? 'On track' : 'Short'" />
      </div>
      <div class="grid g4" style="margin-bottom:14px">
        <div class="stat"><div class="label">Target</div><div class="value num" style="font-size:20px">{{ pkr(m.target) }}</div></div>
        <div class="stat"><div class="label">Projected</div><div class="value num" style="font-size:20px">{{ pkr(m.projected) }}</div></div>
        <div class="stat"><div class="label">Difference</div><div class="value num" style="font-size:20px" :style="{ color: m.projectedDiff < 0 ? 'var(--bad-ink)' : 'var(--good-ink)' }">{{ signedPkr(m.projectedDiff) }}</div></div>
        <div class="stat"><div class="label">Needed per month</div><div class="value num" style="font-size:20px">{{ pkr(m.required + m.adjustmentPerMonth) }}</div></div>
      </div>
      <ForecastChart />
      <p class="faint mt">Projection uses your average saving over recent completed months (or the planned figure in Settings until there is history), capped this month by what's left after spending.</p>
    </section>

    <!-- Monthly review (§13) -->
    <div class="grid g2 mt">
      <section class="card">
        <div class="card-head">
          <div><h2>Monthly review</h2></div>
          <select v-model="reviewMonth" class="input" style="width:auto" aria-label="Review month">
            <option v-for="h in [...history].reverse()" :key="h.month" :value="h.month">{{ monthLabel(h.month, 'long') }}{{ h.current ? ' (so far)' : '' }}</option>
          </select>
        </div>
        <table class="t">
          <tbody>
            <tr><td>Income</td><td class="r num">{{ pkr(review.income) }}</td></tr>
            <tr><td>Expenses</td><td class="r num">{{ pkr(review.expenses) }}</td></tr>
            <tr><td class="faint" style="padding-left:22px">of which lifestyle</td><td class="r num faint">{{ pkr(reviewFlows.lifestyle) }}</td></tr>
            <tr><td>Wedding savings</td><td class="r num">{{ pkr(review.saved) }}</td></tr>
            <tr><td>Required savings</td><td class="r num">{{ pkr(review.required) }}</td></tr>
            <tr><td><strong>Difference</strong></td><td class="r num"><strong :style="{ color: review.diff < 0 ? 'var(--bad-ink)' : 'var(--good-ink)' }">{{ signedPkr(review.diff) }}</strong></td></tr>
            <tr><td>Status</td><td class="r"><StatusPill :status="review.status" :text="review.current ? 'In progress' : reviewNote" /></td></tr>
          </tbody>
        </table>
      </section>

      <section class="card">
        <div class="card-head"><div><h2>History</h2><p>Required vs actual saving, month by month since {{ monthLabel(monthKey(goal.start_date), 'long') }}</p></div></div>
        <div class="table-wrap">
          <table class="t">
            <thead><tr><th>Month</th><th class="r">Required</th><th class="r">Saved</th><th class="r">Variance</th><th></th></tr></thead>
            <tbody>
              <tr v-for="h in [...history].reverse()" :key="h.month">
                <td>{{ monthLabel(h.month) }}<span v-if="h.current" class="faint"> · now</span></td>
                <td class="r num">{{ pkr(h.required) }}</td>
                <td class="r num">{{ pkr(h.saved) }}</td>
                <td class="r num" :style="{ color: h.diff < 0 ? 'var(--bad-ink)' : 'var(--good-ink)' }">{{ signedPkr(h.diff) }}</td>
                <td class="r"><span v-if="h.current && h.status !== 'green'" class="pill neutral">in progress</span><span v-else class="pill" :class="h.status" :title="h.status"><span class="dot"></span>{{ h.status === 'green' ? '✓' : h.status === 'yellow' ? '!' : '✕' }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>
