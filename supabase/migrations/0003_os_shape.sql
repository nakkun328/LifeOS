-- Phase 5.5：OSとしての形を整える
-- 既存のテーブルとデータには手を入れず、列とテーブルを足すだけ（列は NULL 許可か既定値つき）。

-- 設定の唯一の正。1行（key = 'main'）に JSON でまとめて持つ
create table settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table settings enable row level security;

-- 課題：科目・カテゴリ・優先度・メモ（すべて任意）
alter table tasks
  add column subject_id uuid references subjects (id),
  add column category text check (category in ('school', 'club', 'personal')),
  add column priority smallint check (priority between 1 and 3),
  add column memo text;

-- ログ：種別（log / decision）と件名。既存の行はすべて 'log'
alter table logs
  add column kind text not null default 'log' check (kind in ('log', 'decision')),
  add column title text;
create index logs_kind_date on logs (kind, log_date);
