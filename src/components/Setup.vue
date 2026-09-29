<script setup>
import { reactive, ref, computed } from 'vue'
import MoneyInput from './MoneyInput.vue'
import { createPlan, state } from '../store.js'
import { calculateMonthsRemaining } from '../lib/engine.js'
import { pkr } from '../lib/format.js'
import { DEFAULT_CATEGORIES, splitTarget } from '../lib/defaults.js'

const f = reactive({ name: '', weddingDate: '2027-03-15', target: 3_000_000, saved: null, cash: null, income: null, essential: null, allocate: false })
const error = ref('')
const busy = ref(false)

const months = computed(() => (f.weddingDate ? calculateMonthsRemaining({ target_date: f.weddingDate }, state.today) : 0))
const perMonth = computed(() => (months.value > 0 ? Math.max(0, (f.target || 0) - (f.saved || 0)) / months.value : 0))
const split = computed(() => splitTarget(f.target || 0))

async function submit() {
  error.value = ''
  if (!(f.target > 0)) return (error.value = 'Enter the overall wedding target.')
  if (!f.weddingDate || f.weddingDate <= state.today) return (error.value = 'Pick a wedding date in the future.')
  if (!(f.income > 0)) return (error.value = 'Enter your usual monthly income so the monthly budget can be worked out.')
  busy.value = true
  try {
    await createPlan({ ...f, saved: f.saved || 0, cash: f.cash ?? f.saved ?? 0, essential: f.essential || 0 })
  } catch (e) {
    error.value = e.message
  }
  busy.value = false
}
</script>

<template>
  <div class="page" style="max-width:760px;margin:0 auto">
    <div class="page-head">
      <div>
        <div class="brand" style="padding:0;margin-bottom:18px"><span class="brand-mark">♥</span>Wedding Fund</div>
        <h1>Set up your wedding plan</h1>
        <p>Takes a minute. Everything here can be changed later.</p>
      </div>
    </div>

    <form class="card stack" @submit.prevent="submit">
      <div class="form">
        <div class="field"><label for="s_name">Your name</label><input id="s_name" v-model="f.name" class="input" placeholder="Optional" /></div>
        <div class="field"><label for="s_date">Wedding date</label><input id="s_date" v-model="f.weddingDate" type="date" class="input" /></div>
        <div class="field"><label for="s_target">Overall wedding target</label><MoneyInput id="s_target" v-model="f.target" /><span class="hint">Split into categories below. Adjust each one later.</span></div>
        <div class="field"><label for="s_saved">Wedding savings you already have</label><MoneyInput id="s_saved" v-model="f.saved" placeholder="0" /></div>
        <div class="field"><label for="s_cash">Total bank + cash balance today</label><MoneyInput id="s_cash" v-model="f.cash" placeholder="Including wedding savings" /><span class="hint">Used to show how much is actually free to spend.</span></div>
        <div class="field"><label for="s_income">Usual monthly income</label><MoneyInput id="s_income" v-model="f.income" /></div>
        <div class="field"><label for="s_ess">Usual monthly essential expenses</label><MoneyInput id="s_ess" v-model="f.essential" placeholder="Rent, utilities, fuel, groceries…" /></div>
        <div class="field" style="justify-content:flex-end">
          <label class="check"><input v-model="f.allocate" type="checkbox" /> <span>Split my existing savings across categories (critical first)</span></label>
        </div>
      </div>

      <div class="callout" v-if="f.target">
        <strong>{{ months }} saving months</strong> until the wedding (wedding month excluded).
        You'll need to save about <strong class="num">{{ pkr(perMonth) }}</strong> per month.
        <template v-if="f.income"> That leaves <strong class="num">{{ pkr(f.income - (f.essential || 0) - perMonth) }}</strong> a month for everything else.</template>
      </div>

      <details>
        <summary class="small" style="cursor:pointer;font-weight:700">Starting categories ({{ DEFAULT_CATEGORIES.length }})</summary>
        <table class="t mt">
          <tbody>
            <tr v-for="(c, i) in DEFAULT_CATEGORIES" :key="c.name"><td>{{ c.name }}</td><td class="faint">{{ c.priority }}</td><td class="r num">{{ pkr(split[i]) }}</td></tr>
          </tbody>
        </table>
      </details>

      <p v-if="error" class="error">{{ error }}</p>
      <div class="form-actions" style="margin-top:0"><button class="btn primary" :disabled="busy">Create my plan</button></div>
    </form>
  </div>
</template>
