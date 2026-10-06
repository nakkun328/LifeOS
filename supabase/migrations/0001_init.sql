-- Phase 2：勉強・就寝・利用時間・Night Guard の記録
-- アクセスは Web の API（service role）だけ。RLS を有効にして、ポリシーは作らない（= anon は何も読めない）。

create table subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'study' check (kind in ('study', 'club')),
  subject_id uuid references subjects (id),
  started_at timestamptz not null,
  ended_at timestamptz,
  efficiency smallint check (efficiency between 1 and 5),
  progress text,
  note text,
  created_at timestamptz not null default now()
);
-- 同時に動かせるセッションは1つ（終了していない行は高々1件）
create unique index sessions_one_active on sessions ((true)) where ended_at is null;
create index sessions_started_at on sessions (started_at);

create table sleep (
  id uuid primary key default gen_random_uuid(),
  sleep_at timestamptz not null,
  wake_at timestamptz,
  source text not null default 'button' check (source in ('button', 'auto')),
  created_at timestamptz not null default now(),
  unique (source, sleep_at)
);

-- 利用時間。Mac は1分バケット、iPhone は利用区間。送り直しは上書き（二重にならない）
create table usage (
  id uuid primary key default gen_random_uuid(),
  device text not null check (device in ('mac', 'iphone')),
  start timestamptz not null,
  category text not null,
  seconds integer not null check (seconds > 0),
  created_at timestamptz not null default now(),
  unique (device, start, category)
);
create index usage_start on usage (start);

create table guard_events (
  id uuid primary key,
  at timestamptz not null,
  kind text not null check (kind in ('blocked', 'unlocked')),
  site text not null,
  reason text,
  created_at timestamptz not null default now()
);
create index guard_events_at on guard_events (at);

-- iPhone のアプリを開いた・閉じたの記録（Phase 5 のショートカットが送る）。
-- Today の集計が参照するので、テーブルは最初から用意しておく。同じ記録が重複して届いても1件
create table app_events (
  id uuid primary key default gen_random_uuid(),
  app text not null,
  event text not null check (event in ('open', 'close')),
  at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (app, event, at)
);
create index app_events_at on app_events (at);

alter table subjects enable row level security;
alter table sessions enable row level security;
alter table sleep enable row level security;
alter table usage enable row level security;
alter table guard_events enable row level security;
alter table app_events enable row level security;
