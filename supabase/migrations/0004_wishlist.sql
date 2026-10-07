-- Phase 6-1：Wishlist（欲しい物を1か所に集める）
-- 新しいテーブルを足すだけ。既存のテーブルには触れない。お金の管理とは連動しない（合計なども持たない）。
create table wishlist_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price integer check (price >= 0),
  category text,
  product_url text,
  docs_url text,
  priority smallint check (priority between 1 and 3),
  purchased boolean not null default false,
  purchased_at timestamptz,
  memo text,
  created_at timestamptz not null default now()
);
create index wishlist_items_purchased on wishlist_items (purchased, priority);

alter table wishlist_items enable row level security;
