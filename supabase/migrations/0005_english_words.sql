-- Phase 6-2：English Words（英単語の学習専用。Tasks とは分ける）
-- 新しいテーブルを足すだけ。既存のテーブルには触れない。

-- テスト（名前と期限）。単語をまとめて対象にできる
create table word_tests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  due_date date not null,
  created_at timestamptz not null default now()
);

create table english_words (
  id uuid primary key default gen_random_uuid(),
  word text not null,
  meaning text not null,
  -- 苦手度（0〜5）。忘れるたびに上がり、覚えているほど下がる
  weakness smallint not null default 0 check (weakness between 0 and 5),
  status text not null default 'new' check (status in ('new', 'learning', 'weak', 'review', 'mastered')),
  -- 連続で正解した回数（復習の間隔を決める）
  streak integer not null default 0,
  correct_count integer not null default 0,
  wrong_count integer not null default 0,
  -- 日付は、朝6時区切りの「その日」（JST）
  first_studied date,
  last_studied date,
  next_review date,
  -- テスト対象（テスト期限は、テストの期限）
  test_id uuid references word_tests (id),
  created_at timestamptz not null default now()
);
-- 同じ単語は1つ（大文字小文字は区別しない）
create unique index english_words_word_lower on english_words (lower(word));
create index english_words_next_review on english_words (next_review);
create index english_words_test on english_words (test_id);

-- 復習の履歴（「覚えてた」「忘れてた」）
create table word_reviews (
  id uuid primary key default gen_random_uuid(),
  word_id uuid not null references english_words (id),
  result text not null check (result in ('known', 'forgot')),
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index word_reviews_word on word_reviews (word_id, reviewed_at);

alter table word_tests enable row level security;
alter table english_words enable row level security;
alter table word_reviews enable row level security;
