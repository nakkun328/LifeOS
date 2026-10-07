-- Phase 6-3：Journal（その日のデータから日記を自動で作る）
-- 新しいテーブルを足すだけ。既存のテーブルには触れない。
create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  -- 日付は、朝6時区切りの「その日」（JST）。1日に1件
  entry_date date not null unique,
  body text not null default '',
  -- 手で編集したか。true の日記は、自動で上書きしない
  edited boolean not null default false,
  generated_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table journal_entries enable row level security;
