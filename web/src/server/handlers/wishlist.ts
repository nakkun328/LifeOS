import { isHttpUrl, sortWishlist } from '@/lib/wishlist';
import type { WishRow } from '@/lib/types';
import type { Ctx } from '../context';
import { asObject, badRequest, notFound, optStr, str } from '../errors';

const empty = (v: unknown) => v === undefined || v === null || v === '';

function url(v: unknown, label: string): string | null {
  if (empty(v)) return null;
  if (typeof v !== 'string' || v.length > 2000 || !isHttpUrl(v.trim())) throw badRequest(`${label}は http:// か https:// で始まる URL にしてください`);
  return v.trim();
}

/** 任意の項目。未入力は「なし」。入力されたものだけ検証する */
function optionalFields(b: Record<string, unknown>, onlyPresent: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const has = (k: string) => !onlyPresent || b[k] !== undefined;
  if (has('price')) {
    if (empty(b.price)) out.price = null;
    else {
      const p = Number(b.price);
      if (!Number.isInteger(p) || p < 0 || p > 1_000_000_000) throw badRequest('価格は 0 以上の整数にしてください');
      out.price = p;
    }
  }
  if (has('category')) out.category = empty(b.category) ? null : str(b.category, 'カテゴリ', 1, 30);
  if (has('product_url')) out.product_url = url(b.product_url, '商品URL');
  if (has('docs_url')) out.docs_url = url(b.docs_url, 'Google Docs のリンク');
  if (has('priority')) {
    if (empty(b.priority)) out.priority = null;
    else {
      const p = Number(b.priority);
      if (!Number.isInteger(p) || p < 1 || p > 3) throw badRequest('優先度は 高 / 中 / 低 から選んでください');
      out.priority = p;
    }
  }
  if (has('memo')) out.memo = optStr(b.memo, 'メモ', 1000);
  return out;
}

/** 優先度順（購入済みは下）。合計金額などは出さない（お金の管理は別アプリ） */
export async function listWishlist(ctx: Ctx): Promise<WishRow[]> {
  return sortWishlist(await ctx.db.select<WishRow>('wishlist_items'));
}

/** 必須は名前だけ */
export async function createWishItem(ctx: Ctx, body: unknown): Promise<WishRow> {
  const b = asObject(body);
  return ctx.db.insert<WishRow>('wishlist_items', {
    name: str(b.name, '名前', 1, 100),
    purchased: false,
    purchased_at: null,
    created_at: ctx.now.toISOString(),
    ...optionalFields(b, true),
  });
}

/** 編集と、購入済みの切り替え（purchased: true で購入済み、false で未購入に戻す） */
export async function updateWishItem(ctx: Ctx, id: string, body: unknown): Promise<WishRow> {
  const b = asObject(body);
  const patch: Record<string, unknown> = { ...optionalFields(b, true) };
  if (b.name !== undefined) patch.name = str(b.name, '名前', 1, 100);
  if (b.purchased !== undefined) {
    patch.purchased = b.purchased === true;
    patch.purchased_at = b.purchased === true ? ctx.now.toISOString() : null;
  }
  const [row] = await ctx.db.update<WishRow>('wishlist_items', { id }, patch);
  if (!row) throw notFound('項目が見つかりません');
  return row;
}
