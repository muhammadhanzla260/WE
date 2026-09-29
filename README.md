# Wedding Fund

Wedding savings and expense control system, built from *Wedding Savings & Expense Control System: Technical Plan & MVP Specification*. It tracks income, expenses and savings against a wedding target (PKR). It splits the target into categories, separates reserved money from spendable money, forecasts where you'll land by the wedding, and flags GREEN / YELLOW / RED risk.

## Run

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # calculation engine tests (spec examples)
npm run build     # production build in dist/ (installable PWA)
```

On first open, a one-minute setup asks for the wedding date, overall target, current savings, bank/cash balance, monthly income and essentials. It then creates the 11 default categories with a suggested split.

## Storage

- **Default: local.** Data lives in this browser's localStorage. Use Settings → Download backup regularly.
- **Supabase (optional).** Run `supabase/schema.sql` in your project's SQL editor. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, then restart. The app then needs an email/password sign-in, and every table is protected by row-level security.

Deploy `dist/` to Vercel or Netlify (set the same two env vars there for Supabase mode).

## Studio Ledger income

Your monthly profit share from the studio's accounting page (Studio Ledger) comes in by copy and paste. The ledger runs on claude.ai and can't call this app directly.

1. In Studio Ledger, open **Partners → Send to Wedding Fund**. Pick yourself and the month, then click **Copy for Wedding Fund**. The share is worked out in PKR at the ledger's exchange rate.
2. Here, open **Transactions → From Studio Ledger** (or **Settings → Studio Ledger**) and paste the code.

Each month becomes one **Business** income row, dated on the month's last day (or today for the current month). Importing the same month again updates that row instead of adding a second one. A month with no profit removes any row imported for it earlier. For the current month you can also move part of the share into wedding savings, and critical categories are filled first. Parsing lives in `src/lib/ledger.js`.

Supabase mode needs the `source` and `source_ref` columns on `income`. Re-run `supabase/schema.sql` to add them.

## How the numbers work

| Figure | Rule |
|---|---|
| Wedding target | Sum of category targets, so editing a category rebalances the plan (§18) |
| Saved | All money put toward the wedding, including money already paid to vendors |
| Reserved | Saved money still held (saved − wedding payments made from savings) |
| Free cash | Bank/cash balance − reserved (§5) |
| Saving months | Current month through the month before the wedding (Settings can include the wedding month) |
| Required this month | (target − saved before this month) ÷ saving months left. Saving more mid-month lowers next month's figure, not this one |
| Safe to spend | Expected income − essential budget − required saving − lifestyle spent − any essential overrun (§7) |
| Projected balance | Saved + this month's likely saving (capped by what spending leaves) + expected saving × later months. Expected saving = average of recent completed months, or the planned figure in Settings until there is history (§10) |
| Risk | RED if savings are < 90% of the straight-line plan, the projection misses the target, or discretionary spending exceeds the allowance. YELLOW if savings are 90–99% of plan or ≥ 75% of the allowance is used. Otherwise GREEN (§17) |

Other rules:

- **Wedding expenses** are paid either from savings already set aside (this reduces what the category holds) or from this month's income (this counts as saving and spending at once).
- **Contingency.** If a wedding payment is larger than what its category holds, the expense dialog offers to cover the gap from the Emergency Buffer (§19).
- **Shortfalls.** When the plan is short, the Categories page suggests trimming optional categories first, then important ones, and never critical ones (§11).
- **Monthly reset** (§21). Each month gets a `monthly_budgets` record. Its required saving is frozen once the month ends, which keeps the month-by-month history honest.

## Layout

- `src/lib/engine.js`: every calculation from §16, as pure functions (tested in `tests/engine.test.js`)
- `src/store.js`: state, persistence and monthly records
- `src/lib/storage.js`: local and Supabase adapters
- `src/components/`: Dashboard, Categories, Transactions, Month & forecast, Can I afford this?, Settings, Setup, entry dialog

This is a planning and tracking tool, not financial advice.
