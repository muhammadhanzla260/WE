<script setup>
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler } from 'chart.js'
import { data, metrics, state } from '../store.js'
import { lastSavingMonth, calculateCurrentSavings, expectedMonthlySaving, startingAmount } from '../lib/engine.js'
import { monthRange, monthKey, monthLabel, monthDiff } from '../lib/dates.js'
import { pkr, shortPkr } from '../lib/format.js'

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler)

const canvas = ref(null)
let chart = null

// Cumulative savings at each month end: actual so far, the straight-line plan, and the projection.
const series = computed(() => {
  const d = data.value
  const m = metrics.value
  const start = monthKey(d.goal.start_date)
  const end = lastSavingMonth(d.goal)
  const cur = monthKey(state.today)
  const months = monthRange(start, monthDiff(start, end) >= 0 ? end : start)
  const total = months.length
  const starting = startingAmount(d)
  const plan = months.map((_, i) => starting + (m.target - starting) * ((i + 1) / total))
  const actual = months.map(k => (monthDiff(k, cur) >= 0 ? calculateCurrentSavings(d, `${k}-31`) : null))
  // Projection: this month lands where the engine expects, then grows by the expected monthly saving.
  const per = expectedMonthlySaving(d, state.today)
  const curIdx = months.indexOf(cur)
  const projection = months.map((k, i) => {
    if (curIdx < 0 || i < curIdx) return null
    const monthsAfter = total - 1 - curIdx
    const thisMonthEnd = m.projected - per * monthsAfter
    return thisMonthEnd + per * (i - curIdx)
  })
  return { labels: months.map(k => monthLabel(k)), plan, actual, projection }
})

const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

function draw() {
  const s = series.value
  const ink2 = css('--ink-2')
  const grid = css('--grid')
  const cfg = {
    type: 'line',
    data: {
      labels: s.labels,
      datasets: [
        { label: 'Actual saved', data: s.actual, borderColor: css('--series-1'), backgroundColor: css('--series-1'), borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, spanGaps: false },
        { label: 'Plan to target', data: s.plan, borderColor: css('--series-2'), backgroundColor: css('--series-2'), borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, borderDash: [2, 3] },
        { label: 'Projected', data: s.projection, borderColor: css('--series-3'), backgroundColor: css('--series-3'), borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, borderDash: [6, 4] },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'start', labels: { color: ink2, boxWidth: 14, boxHeight: 2, font: { family: css('--font'), weight: '600' } } },
        tooltip: { callbacks: { label: c => (c.raw == null ? null : `${c.dataset.label}: ${pkr(c.raw)}`) } },
      },
      scales: {
        x: { grid: { display: false }, border: { color: grid }, ticks: { color: ink2 } },
        y: { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { color: ink2, callback: v => shortPkr(v), maxTicksLimit: 6 } },
      },
    },
  }
  if (chart) chart.destroy()
  chart = new Chart(canvas.value, cfg)
}

const mq = window.matchMedia('(prefers-color-scheme: dark)')
onMounted(() => { draw(); mq.addEventListener('change', draw) })
onBeforeUnmount(() => { chart?.destroy(); mq.removeEventListener('change', draw) })
watch(series, draw)
</script>

<template>
  <div style="position:relative;height:280px"><canvas ref="canvas" role="img" aria-label="Cumulative wedding savings: actual, planned and projected by month"></canvas></div>
</template>
