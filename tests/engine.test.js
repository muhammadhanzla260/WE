import { describe, it, expect } from 'vitest'
import {
  computeAll, calculateMonthsRemaining, calculateCategoryProgress, simulatePurchase,
  autoAllocate, suggestCuts, monthlyHistory, weeklySummary,
} from '../src/lib/engine.js'

const TODAY = '2026-09-15'

function makeData({ target = 3_000_000, opening = 700_000, income = 500_000, essential = 180_000, categories, savings = [], expenses = [], settings = {} } = {}) {
  const cats = categories ?? [{ id: 'all', name: 'Everything', target_amount: target, priority: 'critical' }]
  return {
    settings: { expected_income: income, essential_budget: essential, cash_balance: 0, ...settings },
    goal: { id: 'g', target_amount: target, target_date: '2027-03-20', start_date: '2026-09-01', starting_amount: opening },
    categories: cats,
    income: [],
    expenses,
    savings: [{ id: 'o', goal_category_id: null, amount: opening, date: '2026-09-01', type: 'opening' }, ...savings],
    budgets: [],
  }
}

describe('master goal (§3)', () => {
  it('counts Sep 2026 → Feb 2027 as 6 saving months', () => {
    expect(calculateMonthsRemaining({ target_date: '2027-03-20' }, TODAY)).toBe(6)
    expect(calculateMonthsRemaining({ target_date: '2027-03-20', include_target_month: true }, TODAY)).toBe(7)
  })

  it('3,000,000 target with 700,000 saved needs 383,333 per month', () => {
    const m = computeAll(makeData(), TODAY)
    expect(m.remaining).toBe(2_300_000)
    expect(Math.round(m.required)).toBe(383_333)
  })

  it('saving during the month does not change this month’s requirement', () => {
    const d = makeData({ savings: [{ id: 's', goal_category_id: null, amount: 100_000, date: '2026-09-10', type: 'deposit' }] })
    const m = computeAll(d, TODAY)
    expect(Math.round(m.required)).toBe(383_333)
    expect(m.savedThisMonth).toBe(100_000)
    expect(Math.round(m.stillToSaveThisMonth)).toBe(283_333)
  })
})

describe('category funding (§4)', () => {
  it('matches the Walima Hall example', () => {
    const d = makeData({
      opening: 0,
      categories: [{ id: 'hall', name: 'Walima Hall', target_amount: 500_000, priority: 'critical' }],
      savings: [{ id: 's', goal_category_id: 'hall', amount: 400_000, date: '2026-09-02' }],
      expenses: [{ id: 'e', goal_category_id: 'hall', amount: 100_000, date: '2026-09-03', expense_type: 'wedding', funded_from: 'reserve' }],
    })
    const hall = calculateCategoryProgress(d, TODAY).categories[0]
    expect(hall.reserved).toBe(300_000)
    expect(hall.spent).toBe(100_000)
    expect(hall.remaining).toBe(100_000)
    expect(hall.progress).toBe(0.8)
  })

  it('matches the Walima example when the 100,000 was paid before using the app', () => {
    const d = makeData({
      opening: 0,
      settings: { cash_balance: 300_000 },
      categories: [{ id: 'hall', name: 'Walima Hall', target_amount: 500_000, priority: 'critical', paid_before: 100_000 }],
      savings: [{ id: 's', goal_category_id: 'hall', amount: 300_000, date: '2026-09-02' }],
    })
    const m = computeAll(d, TODAY)
    const hall = m.categories[0]
    expect([hall.reserved, hall.spent, hall.remaining, hall.progress]).toEqual([300_000, 100_000, 100_000, 0.8])
    expect(m.saved).toBe(400_000) // counts toward the target
    expect(m.reserved).toBe(300_000) // but isn't held any more
    expect(m.freeCash).toBe(0) // and doesn't touch today's cash
    expect(m.expectedToDate).toBe(100_000) // treated as part of the starting position
  })

  it('a wedding payment made from income counts as saving too', () => {
    const d = makeData({ expenses: [{ id: 'e', goal_category_id: 'all', amount: 50_000, date: '2026-09-05', expense_type: 'wedding', funded_from: 'income' }] })
    const m = computeAll(d, TODAY)
    expect(m.saved).toBe(750_000)
    expect(m.savedThisMonth).toBe(50_000)
    expect(m.reserved).toBe(700_000)
  })
})

describe('cash vs reserved (§5)', () => {
  it('900,000 cash with 750,000 reserved leaves 150,000 free', () => {
    const d = makeData({ opening: 750_000, settings: { cash_balance: 900_000 } })
    const m = computeAll(d, TODAY)
    expect(m.reserved).toBe(750_000)
    expect(m.freeCash).toBe(150_000)
  })
})

describe('monthly equation (§7)', () => {
  it('500,000 − 180,000 − 230,000 = 90,000 safe to spend', () => {
    // 1,380,000 remaining over 6 months = 230,000 required
    const m = computeAll(makeData({ opening: 1_620_000 }), TODAY)
    expect(m.required).toBe(230_000)
    expect(m.util.allowance).toBe(90_000)
  })
})

describe('risk (§8, §17)', () => {
  it('is GREEN when on plan and within limits', () => {
    expect(computeAll(makeData({ opening: 1_620_000 }), TODAY).risk.status).toBe('green')
  })

  it('is YELLOW when 75%+ of discretionary budget is used', () => {
    const d = makeData({ opening: 1_620_000, expenses: [{ id: 'e', amount: 70_000, date: '2026-09-05', expense_type: 'lifestyle' }] })
    expect(computeAll(d, TODAY).risk.status).toBe('yellow')
  })

  it('is RED when discretionary spending exceeds the allowance', () => {
    const d = makeData({ opening: 1_620_000, expenses: [{ id: 'e', amount: 95_000, date: '2026-09-05', expense_type: 'lifestyle' }] })
    const m = computeAll(d, TODAY)
    expect(m.risk.status).toBe('red')
    expect(Math.round(m.shortage)).toBe(5_000)
  })

  it('suggests the per-month adjustment for a projected shortage', () => {
    // Planned saving of 336,667/month over 6 months projects 2,720,000 → 280,000 short → 46,667/month more
    const d = makeData({ income: 600_000, settings: { planned_monthly_saving: 336_666.67 } })
    const m = computeAll(d, TODAY)
    expect(Math.round(m.projected / 1000)).toBe(2720)
    expect(m.risk.status).toBe('red')
    expect(Math.round(m.adjustmentPerMonth)).toBe(46_667)
  })

  it('is RED when savings are more than 10% behind trajectory', () => {
    // Two months later with nothing saved since the opening balance
    const m = computeAll(makeData(), '2026-11-10')
    expect(m.savingsRatio).toBeLessThan(0.9)
    expect(m.risk.status).toBe('red')
  })
})

describe('rebalancing (§18)', () => {
  it('raising a category target raises the master target and monthly requirement', () => {
    const cats = [
      { id: 'hall', name: 'Hall', target_amount: 500_000, priority: 'critical' },
      { id: 'rest', name: 'Rest', target_amount: 2_500_000, priority: 'important' },
    ]
    const before = computeAll(makeData({ categories: cats }), TODAY)
    const after = computeAll(makeData({ categories: [{ ...cats[0], target_amount: 650_000 }, cats[1]] }), TODAY)
    expect(after.target - before.target).toBe(150_000)
    expect(Math.round(after.required - before.required)).toBe(25_000)
  })
})

describe('purchase simulator (§9)', () => {
  it('a purchase within the allowance does not reduce wedding saving', () => {
    const d = makeData({ opening: 1_620_000, settings: { cash_balance: 2_000_000 } })
    const r = simulatePurchase(d, TODAY, 50_000)
    expect(r.reducesSaving).toBe(false)
    expect(r.after.projected).toBe(r.before.projected)
  })

  it('a purchase beyond the allowance puts the target at risk', () => {
    const d = makeData({ opening: 1_620_000, settings: { cash_balance: 2_000_000 } })
    const r = simulatePurchase(d, TODAY, 145_000)
    expect(r.reducesSaving).toBe(true)
    expect(r.savingLost).toBe(55_000)
    expect(Math.round(r.trajectoryDiff)).toBe(-55_000)
    expect(r.status).toBe('red')
  })

  it('flags a purchase larger than free cash', () => {
    const d = makeData({ opening: 1_620_000, settings: { cash_balance: 1_650_000 } })
    const r = simulatePurchase(d, TODAY, 40_000)
    expect(r.exceedsFreeCash).toBe(true)
    expect(r.status).toBe('red')
  })
})

describe('allocation helpers', () => {
  const cats = [
    { id: 'a', priority: 'critical', remaining: 100 },
    { id: 'b', priority: 'important', remaining: 200 },
    { id: 'c', priority: 'optional', remaining: 300 },
    { id: 'x', priority: 'important', remaining: 50, is_contingency: true },
  ]
  it('fills critical, then important, then optional, then the buffer', () => {
    expect(autoAllocate(cats, 250).allocations).toEqual([{ id: 'a', amount: 100 }, { id: 'b', amount: 150 }])
    const all = autoAllocate(cats, 1000)
    expect(all.unallocated).toBe(350)
    expect(all.allocations.find(x => x.id === 'x').amount).toBe(50)
  })
  it('suggests optional cuts before important, never critical', () => {
    const r = suggestCuts(cats, 400)
    expect(r.cuts.map(c => c.id)).toEqual(['c', 'b'])
    expect(r.uncovered).toBe(0)
  })
})

describe('history and weekly summary', () => {
  it('records required vs actual per month', () => {
    const d = makeData({ savings: [{ id: 's', goal_category_id: null, amount: 400_000, date: '2026-10-05' }] })
    const rows = monthlyHistory(d, '2026-10-20')
    expect(rows.map(r => r.month)).toEqual(['2026-09', '2026-10'])
    expect(rows[0].saved).toBe(0) // opening balance is not a month's saving
    expect(rows[1].saved).toBe(400_000)
  })
  it('reports the top lifestyle category', () => {
    const d = makeData({ expenses: [
      { id: '1', amount: 5000, date: '2026-09-14', expense_type: 'lifestyle', expense_category: 'Dining out' },
      { id: '2', amount: 9000, date: '2026-09-02', expense_type: 'lifestyle', expense_category: 'Shopping' },
    ] })
    expect(weeklySummary(d, TODAY).topCategory).toEqual({ name: 'Shopping', amount: 9000 })
  })
})
