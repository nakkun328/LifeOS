-- Phase 3：課題と一言ログ
create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  due_date date not null,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index tasks_due on tasks (due_date);

create table logs (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  tag text not null check (tag in ('趣味', '部活', '日記')),
  -- 1日の区切りは朝6時（JST）。深夜のログは前日として数える
  log_date date not null,
  created_at timestamptz not null default now()
);
create index logs_date on logs (log_date);

alter table tasks enable row level security;
alter table logs enable row level security;
