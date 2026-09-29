import { reactive } from 'vue'

// App-wide UI state: which entry dialog is open, and a transient toast message.
export const ui = reactive({ entry: null, toast: '', ledgerImport: false })

export function openEntry(kind, row = null, preset = {}) {
  ui.entry = { kind, row, preset }
}

let t = null
export function toast(msg) {
  ui.toast = msg
  clearTimeout(t)
  t = setTimeout(() => (ui.toast = ''), 2600)
}
