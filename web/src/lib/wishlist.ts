import type { WishRow } from './types';

/**
 * 一覧の並び：購入していないものを優先度の高い順（未設定は最後）、同じ優先度なら登録が古い順。
 * 購入済みは、その下にまとめる（購入が新しい順）。
 */
export function sortWishlist(items: WishRow[]): WishRow[] {
  const prio = (w: WishRow) => w.priority ?? 9;
  const open = items
    .filter((w) => !w.purchased)
    .sort((a, b) => prio(a) - prio(b) || a.created_at.localeCompare(b.created_at));
  const bought = items
    .filter((w) => w.purchased)
    .sort((a, b) => (b.purchased_at ?? '').localeCompare(a.purchased_at ?? '') || b.created_at.localeCompare(a.created_at));
  return [...open, ...bought];
}

export const PRIORITY_NAME: Record<number, string> = { 1: '高', 2: '中', 3: '低' };

/** http(s) の URL だけを許す（javascript: などを弾く） */
export function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}
