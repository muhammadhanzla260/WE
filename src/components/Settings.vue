<script setup>
import { reactive, ref, computed } from 'vue'
import MoneyInput from './MoneyInput.vue'
import { state, profile, goal, metrics as m, updateGoal, updateSettings, scaleTarget, exportBackup, importBackup, resetAll, updateProfileName } from '../store.js'
import { pkr } from '../lib/format.js'
import { ui, toast } from '../ui.js'
import { LEDGER_SOURCE } from '../lib/ledger.js'

const ledgerMonths = computed(() => state.db.income.filter(r => r.source === LEDGER_SOURCE).length)

const s = profile.value.settings
const f = reactive({
  name: profile.value.name || '',
  target_date: goal.value.target_date,
  include_target_month: !!goal.value.include_target_month,
  target: m.value.target,
  expected_income: s.expected_income || 0,
  essential_budget: s.essential_budget || 0,
  planned_monthly_saving: s.planned_monthly_saving || null,
  cash: Math.round(m.value.cash),
})
const fileInput = ref(null)

async function savePlan() {
  await updateGoal({ target_date: f.target_date, include_target_month: f.include_target_month })
  if (f.target > 0 && Math.round(f.target) !== Math.round(m.value.target)) await scaleTarget(f.target)
  toast('Wedding plan updated.')
}

async function saveMoney() {
  await updateSettings({ expected_income: f.expected_income || 0, essential_budget: f.essential_budget || 0, planned_monthly_saving: f.planned_monthly_saving || null })
  toast('Defaults saved. They apply to months you haven\'t customised.')
}

// Reconcile: the balance entered becomes the new starting point for the cash figure.
async function saveCash() {
  await updateSettings({ cash_balance: f.cash || 0, cash_date: state.today, cash_set_at: new Date().toISOString() })
  toast('Cash balance updated.')
}

async function saveName() {
  await updateProfileName(f.name)
  toast('Saved.')
}

function download() {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([exportBackup()], { type: 'application/json' }))
  a.download = `wedding-fund-backup-${state.today}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

async function restore(e) {
  const file = e.target.files[0]
  if (!file) return
  if (!confirm('Replace all current data with this backup?')) return
  try {
    await importBackup(await file.text())
    toast('Backup restored.')
  } catch (err) {
    alert(err.message)
  }
  e.target.value = ''
}

async function reset() {
  if (!confirm('Delete ALL wedding plan data on this device? Download a backup first if you might need it.')) return
  await resetAll()
}
</script>

<template>
  <div class="page" style="max-width:820px">
    <div class="page-head"><div><h1>Settings</h1><p>Plan details, monthly defaults and your data.</p></div></div>

    <div class="stack">
      <section class="card">
        <div class="card-head"><div><h2>Wedding plan</h2><p>Changing the total scales every category target proportionally.</p></div></div>
        <form class="form" @submit.prevent="savePlan">
          <div class="field"><label for="st_date">Wedding date</label><input id="st_date" v-model="f.target_date" type="date" class="input" /></div>
          <div class="field"><label for="st_target">Overall target</label><MoneyInput id="st_target" v-model="f.target" /></div>
          <div class="field wide"><label class="check"><input v-model="f.include_target_month" type="checkbox" /> <span>Count the wedding month itself as a saving month (for example, if the wedding is late in the month after payday)</span></label></div>
          <div class="field wide" style="flex-direction:row;justify-content:flex-end"><button class="btn primary sm">Save plan</button></div>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><div><h2>Monthly defaults</h2><p>Used for any month without its own budget (set that on the Month page).</p></div></div>
        <form class="form" @submit.prevent="saveMoney">
          <div class="field"><label for="st_inc">Usual monthly income</label><MoneyInput id="st_inc" v-model="f.expected_income" /></div>
          <div class="field"><label for="st_ess">Usual essential expenses</label><MoneyInput id="st_ess" v-model="f.essential_budget" /></div>
          <div class="field wide"><label for="st_plan">Planned monthly wedding saving (optional)</label><MoneyInput id="st_plan" v-model="f.planned_monthly_saving" placeholder="Leave empty to assume you save exactly what's required" />
            <span class="hint">Used for the forecast until you have a completed month of history; after that, your real average is used.</span></div>
          <div class="field wide" style="flex-direction:row;justify-content:flex-end"><button class="btn primary sm">Save defaults</button></div>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><div><h2>Bank + cash balance</h2><p>Currently calculated as <strong class="num">{{ pkr(m.cash) }}</strong>. Update it whenever it drifts from your real balance.</p></div></div>
        <form class="form" @submit.prevent="saveCash">
          <div class="field"><label for="st_cash">Actual balance today (all accounts + cash)</label><MoneyInput id="st_cash" v-model="f.cash" /></div>
          <div class="field" style="justify-content:flex-end"><button class="btn primary sm" style="align-self:flex-start">Update balance</button></div>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><div><h2>Studio Ledger</h2><p>Bring in your monthly profit share from the studio's accounting page. Each month is recorded once as Business income; importing it again updates it.</p></div></div>
        <div class="row wrap">
          <button class="btn primary sm" @click="ui.ledgerImport = true">⇩ Import a month's share</button>
          <span class="faint">{{ ledgerMonths ? `${ledgerMonths} month${ledgerMonths === 1 ? '' : 's'} imported so far` : 'Nothing imported yet' }}</span>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><div><h2>Profile</h2></div></div>
        <form class="form" @submit.prevent="saveName">
          <div class="field"><label for="st_name">Name</label><input id="st_name" v-model="f.name" class="input" /></div>
          <div class="field" style="justify-content:flex-end"><button class="btn sm" style="align-self:flex-start">Save</button></div>
        </form>
      </section>

      <section class="card">
        <div class="card-head">
          <div>
            <h2>Your data</h2>
            <p v-if="state.adapter.kind === 'local'">Stored in this browser only. Download a backup regularly.</p>
            <p v-else>Synced to your Supabase account ({{ state.authUser?.email }}).</p>
          </div>
        </div>
        <div class="row wrap">
          <button class="btn" @click="download">⇩ Download backup</button>
          <template v-if="state.adapter.kind === 'local'">
            <button class="btn" @click="fileInput.click()">⇧ Restore backup</button>
            <input ref="fileInput" type="file" accept="application/json" hidden @change="restore" />
            <button class="btn danger" @click="reset">Delete all data</button>
          </template>
          <button v-else class="btn" @click="state.adapter.signOut()">Sign out</button>
        </div>
      </section>

      <p class="faint">A planning and tracking tool, not financial advice. Keep wedding savings separate from your emergency reserves where you can, and update category targets as real quotations come in.</p>
    </div>
  </div>
</template>
