-- Wedding Fund schema (spec §15). Run in the Supabase SQL editor once.
-- Every table carries user_id so row-level security can keep each account's data private.

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  currency text not null default 'PKR',
  settings jsonb not null default '{}'::jsonb, -- monthly defaults, cash balance, planned saving
  created_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  target_amount numeric(14, 2) not null default 0,
  target_date date not null,
  start_date date not null default current_date,
  starting_amount numeric(14, 2) not null default 0,
  include_target_month boolean not null default false,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.goal_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id uuid not null references public.goals (id) on delete cascade,
  name text not null,
  target_amount numeric(14, 2) not null default 0,
  paid_before numeric(14, 2) not null default 0, -- payments made before using the app
  priority text not null default 'important' check (priority in ('critical', 'important', 'optional')),
  deadline date,
  notes text,
  is_contingency boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.income (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  income_type text not null,
  date date not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_category_id uuid references public.goal_categories (id) on delete set null,
  amount numeric(14, 2) not null check (amount > 0),
  expense_category text,
  expense_type text not null check (expense_type in ('essential', 'lifestyle', 'wedding')),
  funded_from text check (funded_from in ('reserve', 'income')), -- wedding expenses only
  date date not null,
  description text,
  created_at timestamptz not null default now()
);

-- Signed amounts: + into the fund/category, − out (withdrawals, the "from" side of a reallocation).
-- goal_category_id null = Unallocated.
create table if not exists public.savings_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id uuid not null references public.goals (id) on delete cascade,
  goal_category_id uuid references public.goal_categories (id) on delete set null,
  amount numeric(14, 2) not null,
  date date not null,
  type text not null check (type in ('opening', 'deposit', 'withdrawal', 'reallocation')),
  pair_id uuid, -- links the two halves of a reallocation
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.monthly_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  month text not null, -- 'YYYY-MM'
  expected_income numeric(14, 2) not null default 0,
  essential_budget numeric(14, 2) not null default 0,
  discretionary_budget numeric(14, 2),
  required_savings numeric(14, 2),
  actual_savings numeric(14, 2),
  created_at timestamptz not null default now(),
  unique (user_id, month)
);

create index if not exists expenses_user_date on public.expenses (user_id, date);
create index if not exists income_user_date on public.income (user_id, date);

-- Income imported from Studio Ledger: one row per month (source_ref = 'YYYY-MM').
-- "add column if not exists" also upgrades a database created before this existed; re-run this file.
alter table public.income add column if not exists source text;
alter table public.income add column if not exists source_ref text;
create unique index if not exists income_user_source on public.income (user_id, source, source_ref) where source is not null;
create index if not exists savings_goal_date on public.savings_transactions (goal_id, date);

-- Allocated / spent per category, for reporting outside the app (the app computes these itself).
create or replace view public.goal_category_progress with (security_invoker = true) as
select
  c.id, c.goal_id, c.name, c.target_amount, c.priority, c.deadline,
  coalesce((select sum(s.amount) from public.savings_transactions s where s.goal_category_id = c.id), 0)
    + coalesce((select sum(e.amount) from public.expenses e where e.goal_category_id = c.id and e.funded_from = 'income'), 0) as allocated_amount,
  coalesce((select sum(e.amount) from public.expenses e where e.goal_category_id = c.id and e.expense_type = 'wedding'), 0) as spent_amount
from public.goal_categories c;

-- Row-level security: each user sees and changes only their own rows.
do $$
declare t text;
begin
  foreach t in array array['goals', 'goal_categories', 'income', 'expenses', 'savings_transactions', 'monthly_budgets'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

alter table public.users enable row level security;
drop policy if exists "own profile" on public.users;
create policy "own profile" on public.users for all using (id = auth.uid()) with check (id = auth.uid());
