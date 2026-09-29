export const pkr = n => `PKR ${Math.round(Number(n) || 0).toLocaleString('en-US')}`

// Signed amount, e.g. "+ PKR 20,000" / "− PKR 5,000".
export const signedPkr = n => `${n < 0 ? '−' : '+'} ${pkr(Math.abs(n))}`

// Compact for tight spots: 1.25M, 450K.
export function shortPkr(n) {
  const a = Math.abs(n)
  const s = a >= 1e6 ? `${+(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `${Math.round(a / 1e3)}K` : String(Math.round(a))
  return `${n < 0 ? '−' : ''}${s}`
}

export const pct = (x, digits = 0) => (Number.isFinite(x) ? `${(x * 100).toFixed(digits)}%` : '—')

export const uid = () => crypto.randomUUID()
