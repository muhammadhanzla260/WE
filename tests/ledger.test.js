import { describe, it, expect } from 'vitest'
import { parseLedgerCode, incomeDateFor, findLedgerIncome, LEDGER_SOURCE } from '../src/lib/ledger.js'

const code = (o = {}) => JSON.stringify({ app: 'studio-ledger', kind: 'partner-share', version: 1, month: '2026-08', partner: 'Hanzla', pct: 50, amount_pkr: 150400.6, profit_pkr: 300801.2, rate: 280, ...o })

describe('Studio Ledger import', () => {
  it('reads a ledger code and rounds the share to whole rupees', () => {
    const s = parseLedgerCode(`  ${code()}\n`)
    expect(s).toMatchObject({ month: '2026-08', partner: 'Hanzla', pct: 50, amount: 150401, profit: 300801.2, rate: 280 })
  })

  it('rejects anything that is not a ledger code', () => {
    expect(() => parseLedgerCode('hello')).toThrow(/Studio Ledger code/)
    expect(() => parseLedgerCode('{"app":"wedding-fund"}')).toThrow(/Studio Ledger code/)
    expect(() => parseLedgerCode(code({ month: '2026-13' }))).toThrow(/month/)
    expect(() => parseLedgerCode(code({ amount_pkr: 'lots' }))).toThrow(/amount/)
    expect(() => parseLedgerCode(code({ version: 2 }))).toThrow(/newer version/)
  })

  it('keeps a loss month as a negative share so the caller can decline it', () => {
    expect(parseLedgerCode(code({ amount_pkr: -20000 })).amount).toBe(-20000)
  })

  it('dates past months on their last day and the current month today', () => {
    expect(incomeDateFor('2026-08', '2026-09-30')).toBe('2026-08-31')
    expect(incomeDateFor('2026-02', '2026-09-30')).toBe('2026-02-28')
    expect(incomeDateFor('2026-09', '2026-09-15')).toBe('2026-09-15')
    expect(() => incomeDateFor('2026-10', '2026-09-30')).toThrow(/hasn’t started/)
  })

  it('finds the income row already imported for a month', () => {
    const rows = [{ id: 'a', source: LEDGER_SOURCE, source_ref: '2026-08' }, { id: 'b', income_type: 'Salary' }]
    expect(findLedgerIncome(rows, '2026-08').id).toBe('a')
    expect(findLedgerIncome(rows, '2026-07')).toBeNull()
  })
})
