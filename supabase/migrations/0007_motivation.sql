-- Phase 7：Motivation（旧「Motivation Monitor」の統合）
-- 新しいテーブルを足すだけ。既存のテーブルには触れない。
create table motivation_records (
  id uuid primary key default gen_random_uuid(),
  -- 日付は、朝6時区切りの「その日」（日本時間）。1日に1件
  record_date date not null unique,
  -- 項目ごとの点数（キー：phys / photo / video / baseball / prospi / game。値は 1〜10 の整数）。
  -- 記録していない項目は、キーごと無い（欠けは欠けのまま）。キーの検証はアプリ側で行う（項目を変えやすくするため）
  scores jsonb not null default '{}'::jsonb,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint motivation_scores_is_object check (jsonb_typeof(scores) = 'object')
);

alter table motivation_records enable row level security;
