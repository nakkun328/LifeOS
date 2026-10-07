import { describe, expect, it } from 'vitest';
import { sortWishlist } from '@/lib/wishlist';
import { HttpError } from './errors';
import { createWishItem, listWishlist, updateWishItem } from './handlers/wishlist';
import { at, makeTestCtx } from './testing';

const status = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(HttpError);
  return (e as HttpError).status;
};

describe('Wishlist', () => {
  it('名前だけで登録できる（ほかは空）', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    const w = await createWishItem(ctx, { name: 'メカニカルキーボード' });
    expect(w).toMatchObject({ name: 'メカニカルキーボード', purchased: false });
    expect(w.price ?? null).toBeNull();
    expect(w.priority ?? null).toBeNull();
    expect(w.product_url ?? null).toBeNull();
  });

  it('価格・カテゴリ・商品URL・Docs リンク・優先度・メモを入れても保存される', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    const w = await createWishItem(ctx, {
      name: 'モーター', price: 1200, category: '電子部品', product_url: 'https://example.com/p/1',
      docs_url: 'https://docs.google.com/document/d/abc', priority: 1, memo: '12V',
    });
    expect(w).toMatchObject({ price: 1200, category: '電子部品', product_url: 'https://example.com/p/1', docs_url: 'https://docs.google.com/document/d/abc', priority: 1, memo: '12V' });
  });

  it('空の追加項目（空文字・null）は「なし」として登録できる', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    const w = await createWishItem(ctx, { name: 'a', price: '', category: '', product_url: '', docs_url: null, priority: '', memo: '' });
    expect(w.price ?? null).toBeNull();
    expect(w.category ?? null).toBeNull();
  });

  it('入力された項目は検証する（名前なし・価格・URL・優先度）', async () => {
    const ctx = makeTestCtx();
    expect(await status(createWishItem(ctx, {}))).toBe(400);
    expect(await status(createWishItem(ctx, { name: '' }))).toBe(400);
    expect(await status(createWishItem(ctx, { name: 'a', price: -1 }))).toBe(400);
    expect(await status(createWishItem(ctx, { name: 'a', price: 1.5 }))).toBe(400);
    expect(await status(createWishItem(ctx, { name: 'a', product_url: 'javascript:alert(1)' }))).toBe(400);
    expect(await status(createWishItem(ctx, { name: 'a', docs_url: 'ftp://x' }))).toBe(400);
    expect(await status(createWishItem(ctx, { name: 'a', priority: 4 }))).toBe(400);
  });

  it('一覧は優先度順（未設定は最後）。購入済みは下にまとめる', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    await createWishItem(at(ctx, '2026-10-01T10:00:00'), { name: '低', priority: 3 });
    await createWishItem(at(ctx, '2026-10-02T10:00:00'), { name: '未設定' });
    await createWishItem(at(ctx, '2026-10-03T10:00:00'), { name: '高', priority: 1 });
    const bought = await createWishItem(at(ctx, '2026-10-04T10:00:00'), { name: '買った高', priority: 1 });
    await updateWishItem(ctx, bought.id, { purchased: true });
    expect((await listWishlist(ctx)).map((w) => w.name)).toEqual(['高', '低', '未設定', '買った高']);
  });

  it('1タップで購入済みにできる。戻すこともできる', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    const w = await createWishItem(ctx, { name: 'a' });
    const done = await updateWishItem(ctx, w.id, { purchased: true });
    expect(done.purchased).toBe(true);
    expect(done.purchased_at).not.toBeNull();
    const back = await updateWishItem(ctx, w.id, { purchased: false });
    expect(back).toMatchObject({ purchased: false, purchased_at: null });
  });

  it('購入済みにしても、ほかの項目は消えない。編集もできる', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    const w = await createWishItem(ctx, { name: 'a', price: 500, priority: 2 });
    await updateWishItem(ctx, w.id, { purchased: true });
    const edited = await updateWishItem(ctx, w.id, { name: 'a2', price: 800 });
    expect(edited).toMatchObject({ name: 'a2', price: 800, priority: 2, purchased: true });
    expect(await status(updateWishItem(ctx, 'missing', { purchased: true }))).toBe(404);
  });

  it('お金の管理とは連動しない（合計や支出のデータを作らない）', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    const w = await createWishItem(ctx, { name: 'a', price: 5000 });
    await updateWishItem(ctx, w.id, { purchased: true });
    expect(Object.keys(ctx.db.tables)).toEqual(['wishlist_items']);
  });
});

describe('sortWishlist（純粋関数）', () => {
  const mk = (name: string, over: object = {}) => ({
    id: name, name, price: null, category: null, product_url: null, docs_url: null, priority: null,
    purchased: false, purchased_at: null, memo: null, created_at: '2026-10-01T00:00:00Z', ...over,
  });
  it('同じ優先度なら、登録が古い順。購入済みは購入が新しい順', () => {
    const items = [
      mk('b', { priority: 1, created_at: '2026-10-02T00:00:00Z' }),
      mk('a', { priority: 1, created_at: '2026-10-01T00:00:00Z' }),
      mk('old', { purchased: true, purchased_at: '2026-10-03T00:00:00Z' }),
      mk('new', { purchased: true, purchased_at: '2026-10-05T00:00:00Z' }),
    ];
    expect(sortWishlist(items).map((x) => x.name)).toEqual(['a', 'b', 'new', 'old']);
  });
});
