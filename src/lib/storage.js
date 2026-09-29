// Storage adapters. Both expose the same small API over the spec's tables (§15).
// Local (default): everything in this browser's localStorage.
// Supabase: used when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.

export const TABLES = ['users', 'goals', 'goal_categories', 'income', 'expenses', 'savings_transactions', 'monthly_budgets']

const emptyDb = () => Object.fromEntries(TABLES.map(t => [t, []]))

function localAdapter() {
  const KEY = 'wedding-fund-v1'
  const read = () => {
    try { return { ...emptyDb(), ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return emptyDb() }
  }
  const write = db => localStorage.setItem(KEY, JSON.stringify(db))
  const LOCAL_USER = { id: 'local', email: null }
  return {
    kind: 'local',
    async getUser() { return LOCAL_USER },
    onAuthChange() {},
    async loadAll() { return read() },
    async insert(table, rows) {
      const db = read()
      db[table].push(...rows.map(r => ({ ...r, user_id: 'local' })))
      write(db)
    },
    async update(table, id, patch) {
      const db = read()
      const i = db[table].findIndex(r => r.id === id)
      if (i >= 0) db[table][i] = { ...db[table][i], ...patch }
      write(db)
    },
    async remove(table, ids) {
      const db = read()
      db[table] = db[table].filter(r => !ids.includes(r.id))
      write(db)
    },
    async replaceAll(next) { write({ ...emptyDb(), ...next }) },
  }
}

async function supabaseAdapter(url, key) {
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(url, key)
  const check = ({ error }) => { if (error) throw new Error(error.message) }
  let userId = null
  return {
    kind: 'supabase',
    async getUser() {
      const { data } = await sb.auth.getUser()
      userId = data.user?.id || null
      return data.user
    },
    onAuthChange(cb) { sb.auth.onAuthStateChange((_e, session) => { userId = session?.user?.id || null; cb(session?.user || null) }) },
    signIn: (email, password) => sb.auth.signInWithPassword({ email, password }),
    signUp: (email, password) => sb.auth.signUp({ email, password }),
    signOut: () => sb.auth.signOut(),
    async loadAll() {
      const db = emptyDb()
      await Promise.all(TABLES.map(async t => {
        const res = await sb.from(t).select('*')
        check(res)
        db[t] = res.data.map(r => normalize(r))
      }))
      return db
    },
    async insert(table, rows) { check(await sb.from(table).insert(rows.map(r => (table === 'users' ? { ...r, id: userId } : { ...r, user_id: userId })))) },
    async update(table, id, patch) { check(await sb.from(table).update(patch).eq('id', id)) },
    async remove(table, ids) { check(await sb.from(table).delete().in('id', ids)) },
    async replaceAll() { throw new Error('Import is only available in local mode.') },
  }
}

// Postgres numeric comes back as strings; the engine wants numbers.
const NUMERIC = ['amount', 'target_amount', 'paid_before', 'starting_amount', 'expected_income', 'essential_budget', 'discretionary_budget', 'required_savings', 'actual_savings']
function normalize(row) {
  const out = { ...row }
  for (const k of NUMERIC) if (out[k] != null) out[k] = Number(out[k])
  return out
}

export async function createAdapter() {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  return url && key ? supabaseAdapter(url, key) : localAdapter()
}
