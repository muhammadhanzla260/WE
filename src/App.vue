<script setup>
import { ref, computed, onMounted } from 'vue'
import { state, goal, metrics } from './store.js'
import { ui, openEntry } from './ui.js'
import StatusPill from './components/StatusPill.vue'
import Login from './components/Login.vue'
import Setup from './components/Setup.vue'
import Dashboard from './components/Dashboard.vue'
import Categories from './components/Categories.vue'
import Transactions from './components/Transactions.vue'
import MonthView from './components/MonthView.vue'
import Simulator from './components/Simulator.vue'
import Settings from './components/Settings.vue'
import EntryModal from './components/EntryModal.vue'
import LedgerImport from './components/LedgerImport.vue'

const PAGES = {
  dashboard: { label: 'Dashboard', icon: '◉', component: Dashboard },
  categories: { label: 'Categories', icon: '▦', component: Categories },
  transactions: { label: 'Transactions', icon: '⇄', component: Transactions },
  month: { label: 'Month & forecast', short: 'Month', icon: '◷', component: MonthView },
  afford: { label: 'Can I afford this?', short: 'Afford?', icon: '?', component: Simulator },
  settings: { label: 'Settings', icon: '⚙', component: Settings },
}
const route = ref('dashboard')
const readHash = () => { const h = location.hash.slice(1); route.value = PAGES[h] ? h : 'dashboard' }
onMounted(() => { readHash(); window.addEventListener('hashchange', () => { readHash(); window.scrollTo(0, 0) }) })
const page = computed(() => PAGES[route.value].component)
</script>

<template>
  <div v-if="!state.ready" class="empty" style="padding-top:30vh">Loading…</div>
  <div v-else-if="state.error" class="page"><div class="callout red"><strong>Couldn't load your data.</strong> {{ state.error }}</div></div>
  <Login v-else-if="!state.authUser" />
  <Setup v-else-if="!goal" />

  <div v-else class="shell">
    <aside class="side">
      <div class="brand"><span class="brand-mark">♥</span>Wedding Fund</div>
      <nav class="nav" aria-label="Main">
        <a v-for="(p, k) in PAGES" :key="k" :href="`#${k}`" :class="{ active: route === k }"><span class="ico">{{ p.icon }}</span>{{ p.label }}</a>
      </nav>
      <div class="side-foot">All amounts in PKR<br />{{ state.adapter.kind === 'local' ? 'Saved on this device' : 'Synced with Supabase' }}</div>
    </aside>

    <main class="main">
      <header class="topbar">
        <StatusPill :status="metrics.risk.status" />
        <div class="quick">
          <button class="btn sm" @click="openEntry('income')">＋ Income</button>
          <button class="btn sm" @click="openEntry('savings')">＋ Savings</button>
          <button class="btn sm primary" @click="openEntry('expense')">− Expense</button>
        </div>
      </header>
      <component :is="page" :key="route" />
    </main>

    <!-- Mobile: one tap to record anything (§20) -->
    <nav class="bottom-bar" aria-label="Mobile">
      <a href="#dashboard" :class="{ active: route === 'dashboard' }"><span class="ico">◉</span><span>Home</span></a>
      <a href="#categories" :class="{ active: route === 'categories' }"><span class="ico">▦</span><span>Categories</span></a>
      <button class="add" aria-label="Add entry" @click="openEntry('expense')"><span class="ico">＋</span><span>Add</span></button>
      <a href="#month" :class="{ active: route === 'month' }"><span class="ico">◷</span><span>Month</span></a>
      <a href="#afford" :class="{ active: route === 'afford' }"><span class="ico">?</span><span>Afford?</span></a>
    </nav>
  </div>

  <EntryModal v-if="ui.entry" :key="ui.entry.kind + (ui.entry.row?.id || '')" />
  <LedgerImport v-if="ui.ledgerImport && goal" />
  <div v-if="ui.toast" class="toast" role="status">{{ ui.toast }}</div>
</template>
