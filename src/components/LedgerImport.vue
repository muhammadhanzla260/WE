<script setup>
import { ref, computed, watch } from 'vue'
import Modal from './Modal.vue'
import MoneyInput from './MoneyInput.vue'
import { state, metrics as m, importLedgerShare } from '../store.js'
import { parseLedgerCode, findLedgerIncome } from '../lib/ledger.js'
import { pkr } from '../lib/format.js'
import { monthLabel, monthKey, monthDiff } from '../lib/dates.js'
import { ui, toast } from '../ui.js'

const text = ref('')
const error = ref('')
const busy = ref(false)
const save = ref(false)
const saveAmount = ref(null)

const parsed = computed(() => {
  if (!text.value.trim()) return { share: null, error: '' }
  try { return { share: parseLedgerCode(text.value), error: '' } } catch (e) { return { share: null, error: e.message } }
})
const share = computed(() => parsed.value.share)
const future = computed(() => share.value && monthDiff(monthKey(state.today), share.value.month) > 0)
const current = computed(() => share.value?.month === monthKey(state.today))
const existing = computed(() => (share.value ? findLedgerIncome(state.db.income, share.value.month) : null))

// Suggest saving what this month still needs, up to the share itself (current month only).
watch(share, s => {
  save.value = false
  saveAmount.value = s && current.value ? Math.max(0, Math.min(s.amount, Math.round(m.value.stillToSaveThisMonth))) || null : null
})

async function pasteFromClipboard() {
  try { text.value = await navigator.clipboard.readText() } catch { error.value = 'Couldn’t read the clipboard. Paste into the box instead (Ctrl+V).' }
}

async function submit() {
  error.value = ''
  const s = share.value
  if (!s || future.value) return
  if (save.value && !(saveAmount.value > 0)) return (error.value = 'Enter how much to save, or untick the saving option.')
  if (save.value && saveAmount.value > s.amount) return (error.value = `You can save at most the share itself (${pkr(s.amount)}).`)
  busy.value = true
  try {
    const result = await importLedgerShare(s, { saveAmount: current.value && save.value ? saveAmount.value : 0 })
    const month = monthLabel(s.month, 'long')
    toast({
      added: `${month} share added: ${pkr(s.amount)}.`,
      updated: `${month} share updated to ${pkr(s.amount)}.`,
      removed: `${month} had no profit, so its imported income was removed.`,
      none: `${month} had no profit, so there’s nothing to record.`,
    }[result] + (current.value && save.value ? ` ${pkr(saveAmount.value)} added to wedding savings.` : ''))
    ui.ledgerImport = false
  } catch (e) {
    error.value = e.message
  }
  busy.value = false
}
</script>

<template>
  <Modal title="Import from Studio Ledger" eyebrow="Business income" @close="ui.ledgerImport = false">
    <form @submit.prevent="submit">
      <p class="small" style="color:var(--ink-2);margin-bottom:12px">
        In Studio Ledger, open <strong>Partners → Send to Wedding Fund</strong>, choose the month and click <strong>Copy for Wedding Fund</strong>. Then paste the code here.
      </p>
      <div class="field">
        <div class="row between"><label for="lg_code">Ledger code</label><button type="button" class="btn ghost sm" @click="pasteFromClipboard">Paste from clipboard</button></div>
        <textarea id="lg_code" v-model="text" class="input num" rows="4" spellcheck="false" placeholder='{"app":"studio-ledger", …}' style="resize:vertical;font-size:12px" autofocus></textarea>
      </div>

      <p v-if="parsed.error" class="error mt">{{ parsed.error }}</p>

      <template v-if="share">
        <div class="callout mt" :class="share.amount > 0 && !future ? 'green' : 'yellow'">
          <div class="row between wrap"><strong>{{ monthLabel(share.month, 'long') }} · {{ share.partner }} ({{ share.pct }}%)</strong>
            <strong class="num" style="font-size:18px">{{ share.amount > 0 ? pkr(share.amount) : 'No profit' }}</strong></div>
          <p v-if="share.profit != null" class="small" style="margin-top:4px">
            Studio net profit {{ pkr(share.profit) }}<template v-if="share.revenue != null"> (revenue {{ pkr(share.revenue) }} − costs {{ pkr(share.expenses) }})</template><template v-if="share.rate">, USD at {{ share.rate }} PKR</template>.
          </p>
          <p v-if="future" class="small" style="margin-top:4px">That month hasn’t started yet, so it can’t be recorded.</p>
          <p v-else-if="share.amount <= 0" class="small" style="margin-top:4px">
            {{ existing ? `The ${pkr(existing.amount)} imported earlier for this month will be removed.` : 'There’s nothing to record for this month.' }}
          </p>
          <p v-else class="small" style="margin-top:4px">
            <template v-if="existing">Already imported as <span class="num">{{ pkr(existing.amount) }}</span>. Importing again <strong>updates</strong> it{{ existing.amount === share.amount ? ' (no change)' : '' }}.</template>
            <template v-else>Will be recorded as <strong>Business</strong> income{{ current ? ' today' : ` on ${monthLabel(share.month, 'short')}’s last day` }}.</template>
          </p>
        </div>

        <div v-if="current && share.amount > 0" class="callout mt small">
          <label class="check"><input v-model="save" type="checkbox" /> <span>Also put some of it into wedding savings <span class="faint">(critical categories first)</span></span></label>
          <div v-if="save" class="field mt"><label for="lg_save">Amount to save</label><MoneyInput id="lg_save" v-model="saveAmount" /></div>
          <p class="faint" style="margin-top:6px">
            <template v-if="m.stillToSaveThisMonth > 0">This month still needs <span class="num">{{ pkr(m.stillToSaveThisMonth) }}</span> of its <span class="num">{{ pkr(m.required) }}</span> requirement.</template>
            <template v-else>This month’s saving requirement is already met.</template>
            <template v-if="existing"> Only tick this if you haven’t already saved from this share.</template>
          </p>
        </div>
      </template>

      <p v-if="error" class="error mt">{{ error }}</p>
      <div class="form-actions">
        <button type="button" class="btn ghost" @click="ui.ledgerImport = false">Cancel</button>
        <button class="btn primary" :disabled="busy || !share || future || (share.amount <= 0 && !existing)">
          {{ !share ? 'Import' : share.amount <= 0 ? 'Remove imported income' : existing ? 'Update income' : 'Record income' }}
        </button>
      </div>
    </form>
  </Modal>
</template>
