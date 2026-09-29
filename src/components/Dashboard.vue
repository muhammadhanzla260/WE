<script setup>
import { computed } from 'vue'
import StatusPill from './StatusPill.vue'
import { metrics as m, weekly, goal, profile, updateSettings, allocateUnallocated, state } from '../store.js'
import { pkr, pct, signedPkr } from '../lib/format.js'
import { dateLabel, monthLabel, monthKey, weekStart } from '../lib/dates.js'
import { toast } from '../ui.js'

const weddingMonth = computed(() => monthLabel(monthKey(goal.value.target_date), 'long'))
const u = computed(() => m.value.util)
const safeLeft = computed(() => Math.max(0, u.value.remaining))
const usagePct = computed(() => Math.min(1, Number.isFinite(u.value.usage) ? u.value.usage : 1))

const headline = computed(() => ({
  green: 'Your wedding plan is on track.',
  yellow: 'Careful: the plan needs attention.',
  red: 'Your wedding target is at risk.',
})[m.value.risk.status])

const showWeekly = computed(() => profile.value?.settings?.weekly_seen !== weekStart(state.today))
const behind = computed(() => m.value.categories.filter(c => c.status === 'behind'))

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
        <h1>{{ profile?.name ? `Salam, ${profile.name}` : 'Wedding Fund' }}</h1>
        <p>Wedding on {{ dateLabel(goal.target_date) }} · {{ m.monthsRemaining }} saving month{{ m.monthsRemaining === 1 ? '' : 's' }} left</p>
      </div>
    </div>

    <!-- Risk status & the ideal dashboard message (§8, §12) -->
    <section class="callout" :class="m.risk.status">
      <div class="row between wrap">
        <h2>{{ headline }}</h2>
      </div>
      <p class="mt" style="margin-top:8px">
        Of the money you have now, <strong class="num">{{ pkr(m.reserved) }}</strong> is already reserved for the wedding,
        <strong class="num">{{ pkr(Math.max(0, m.freeCash)) }}</strong> is free to spend, and spending more than
        <strong class="num">{{ pkr(safeLeft) }}</strong> this month will put your {{ weddingMonth }} goal at risk.
      </p>
      <ul v-if="m.risk.reasons.length" class="small">
        <li v-for="r in m.risk.reasons" :key="r">{{ r }}</li>
      </ul>
      <p v-if="m.shortage > 0" class="small" style="margin-top:8px">
        Projected {{ weddingMonth }} savings <strong class="num">{{ pkr(m.projected) }}</strong> vs target <strong class="num">{{ pkr(m.target) }}</strong>.
        To close the <strong class="num">{{ pkr(m.shortage) }}</strong> gap, save about <strong class="num">{{ pkr(m.adjustmentPerMonth) }}</strong> more per month<template v-if="m.cuts?.cuts.length">, or reduce <a href="#categories">{{ m.cuts.cuts.map(c => c.name).join(', ') }}</a></template>.
      </p>
      <p v-if="m.freeCash < 0" class="small" style="margin-top:8px"><strong>Your cash is below what's reserved.</strong> Some wedding money has been spent on other things, or your cash balance needs updating in Settings.</p>
    </section>

    <!-- The two numbers that matter most day to day (§5, §7) -->
    <div class="grid g2 mt">
      <section class="card stat hero">
        <div class="label">Safe to spend this month</div>
        <div class="value num" :style="{ color: u.remaining < 0 ? 'var(--bad-ink)' : '' }">{{ u.remaining < 0 ? '−' : '' }}{{ pkr(Math.abs(u.remaining)) }}</div>
        <div class="bar lg mt" :aria-label="`${pct(usagePct)} of discretionary budget used`">
          <span :style="{ width: pct(usagePct), background: u.usage >= 1 ? 'var(--bad)' : u.usage >= .75 ? 'var(--warn)' : 'var(--good)' }"></span>
          <i class="marker" style="left:75%" title="75% warning line"></i>
        </div>
        <div class="note">
          <span class="num">{{ pkr(u.used) }}</span> used of <span class="num">{{ pkr(u.allowance) }}</span> discretionary budget
          ({{ pkr(u.expected_income) }} income − {{ pkr(u.essential_budget) }} essentials − {{ pkr(u.required) }} wedding saving)
        </div>
      </section>
      <section class="card">
        <div class="grid g3 cash-row" style="gap:10px">
          <div class="stat"><div class="label">Total cash</div><div class="value num">{{ pkr(m.cash) }}</div></div>
          <div class="stat"><div class="label">Wedding reserved</div><div class="value num">{{ pkr(m.reserved) }}</div></div>
          <div class="stat"><div class="label">Actually free</div><div class="value num" :style="{ color: m.freeCash < 0 ? 'var(--bad-ink)' : 'var(--good-ink)' }">{{ pkr(m.freeCash) }}</div></div>
        </div>
        <div class="bar lg mt" aria-hidden="true"><span :style="{ width: pct(m.cash > 0 ? Math.min(1, m.reserved / m.cash) : 1) }"></span></div>
        <p class="note faint" style="margin-top:6px">Reserved money belongs to the wedding plan. Don't count it as spendable.</p>
      </section>
    </div>

    <!-- Success criteria (§24) -->
    <div class="grid g4 mt">
      <section class="card stat"><div class="label">Wedding target</div><div class="value num">{{ pkr(m.target) }}</div><div class="note">Sum of category targets</div></section>
      <section class="card stat">
        <div class="label">Saved</div><div class="value num">{{ pkr(m.saved) }}</div>
        <div class="bar mt"><span :style="{ width: pct(m.progress) }"></span></div>
        <div class="note">{{ pct(m.progress) }} of target</div>
      </section>
      <section class="card stat"><div class="label">Remaining</div><div class="value num">{{ pkr(m.remaining) }}</div><div class="note">still to save</div></section>
      <section class="card stat">
        <div class="label">Required this month</div><div class="value num">{{ pkr(m.required) }}</div>
        <div class="note">Saved so far: <span class="num">{{ pkr(m.savedThisMonth) }}</span><template v-if="m.stillToSaveThisMonth > 0"> · <span class="num">{{ pkr(m.stillToSaveThisMonth) }}</span> to go</template><template v-else> ✓ done</template></div>
      </section>
      <section class="card stat">
        <div class="label">Projected {{ weddingMonth }} balance</div><div class="value num">{{ pkr(m.projected) }}</div>
        <div class="note" :style="{ color: m.projectedDiff < 0 ? 'var(--bad-ink)' : 'var(--good-ink)' }">{{ signedPkr(m.projectedDiff) }} vs target</div>
      </section>
      <section class="card stat">
        <div class="label">Savings vs plan</div><div class="value num">{{ signedPkr(m.savingsVariance) }}</div>
        <div class="note">Expected by now: <span class="num">{{ pkr(m.expectedToDate) }}</span></div>
      </section>
      <section class="card stat"><div class="label">Months left</div><div class="value num">{{ m.monthsRemaining }}</div><div class="note">saving months before the wedding</div></section>
      <section class="card stat"><div class="label">Status</div><div class="value" style="font-size:18px;margin-top:8px"><StatusPill :status="m.risk.status" /></div></section>
    </div>

    <!-- Weekly health summary (§20) -->
    <section v-if="weekly && showWeekly" class="card mt">
      <div class="card-head">
        <div><h2>This week's health check</h2><p>Since {{ dateLabel(weekly.from) }}</p></div>
        <button class="btn sm ghost" @click="updateSettings({ weekly_seen: weekStart(state.today) })">Got it</button>
      </div>
      <div class="grid g3">
        <div class="stat"><div class="label">Saved this week</div><div class="value num" style="font-size:20px">{{ pkr(weekly.saved) }}</div></div>
        <div class="stat"><div class="label">Discretionary used (month)</div><div class="value num" style="font-size:20px">{{ pct(Number.isFinite(weekly.usage) ? weekly.usage : 1) }}</div><div class="note">{{ pkr(weekly.used) }} of {{ pkr(weekly.allowance) }}</div></div>
        <div class="stat"><div class="label">Top lifestyle spend (month)</div><div class="value" style="font-size:20px">{{ weekly.topCategory?.name || 'None yet' }}</div><div v-if="weekly.topCategory" class="note num">{{ pkr(weekly.topCategory.amount) }}</div></div>
      </div>
    </section>

    <!-- Category funding (§4) -->
    <section class="card mt">
      <div class="card-head">
        <div>
          <h2>Funding by category</h2>
          <p>{{ m.categories.filter(c => c.status === 'funded').length }} funded · {{ behind.length }} behind schedule</p>
        </div>
        <a class="btn sm" href="#categories">Manage →</a>
      </div>
      <div v-if="m.unallocated.reserved > 0.5" class="callout row between wrap" style="margin-bottom:12px">
        <span><strong class="num">{{ pkr(m.unallocated.reserved) }}</strong> saved but not yet assigned to a category.</span>
        <button class="btn sm primary" @click="allocate">Allocate by priority</button>
      </div>
      <div class="stack" style="gap:12px">
        <div v-for="c in m.categories" :key="c.id">
          <div class="row between small">
            <span><strong>{{ c.name }}</strong> <span class="faint">· {{ c.priority }}</span></span>
            <span class="num">
              {{ pkr(c.contributed) }} / {{ pkr(c.target_amount) }}
              <span class="pill" :class="{ funded: 'green', 'on-track': 'neutral', behind: 'yellow' }[c.status]" style="margin-left:6px">{{ c.status === 'on-track' ? 'on track' : c.status }}</span>
            </span>
          </div>
          <div class="bar mt" style="margin-top:6px">
            <span :style="{ width: pct(Math.min(1, c.progress)) }"></span>
            <i v-if="c.status !== 'funded'" class="marker" :style="{ left: pct(c.expectedPct) }" title="Where this category should be by now"></i>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
