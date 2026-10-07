import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseDb } from './supabaseDb';

/** supabase-js の問い合わせを、決まった行を返す偽物に置き換える（ページ分割の検証用） */
function fakeClient(total: number) {
  const calls: Array<{ range?: [number, number]; order?: string; eq: Array<[string, unknown]> }> = [];
  const client = {
    from() {
      const call: (typeof calls)[number] = { eq: [] };
      calls.push(call);
      const b = {
        select: () => b,
        eq: (c: string, v: unknown) => (call.eq.push([c, v]), b),
        is: (c: string, v: unknown) => (call.eq.push([c, v]), b),
        gte: () => b,
        lt: () => b,
        order: (c: string) => ((call.order = c), b),
        limit: () => b,
        range: (a: number, z: number) => ((call.range = [a, z]), b),
        then: (resolve: (v: unknown) => void) => {
          const [a, z] = call.range ?? [0, total - 1];
          const rows = Array.from({ length: Math.max(0, Math.min(z, total - 1) - a + 1) }, (_, i) => ({ id: a + i }));
          resolve({ data: rows, error: null });
        },
      };
      return b;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe('Supabase の select（ページ分割）', () => {
  it('1000行を超えても、全部そろうまで取る（利用時間の集計が欠けない）', async () => {
    const { client, calls } = fakeClient(2500);
    const rows = await createSupabaseDb(client).select<{ id: number }>('usage');
    expect(rows).toHaveLength(2500);
    expect(rows[0]!.id).toBe(0);
    expect(rows.at(-1)!.id).toBe(2499);
    expect(calls.map((c) => c.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(calls.every((c) => c.order === 'id')).toBe(true); // 順番を固定する
  });

  it('ちょうど1000行のときも、次のページを確認して終わる', async () => {
    const { client, calls } = fakeClient(1000);
    expect(await createSupabaseDb(client).select('usage')).toHaveLength(1000);
    expect(calls).toHaveLength(2);
  });

  it('少ないときは1回で終わる', async () => {
    const { client, calls } = fakeClient(3);
    expect(await createSupabaseDb(client).select('usage')).toHaveLength(3);
    expect(calls).toHaveLength(1);
  });

  it('limit があるときは、ページ分割しない', async () => {
    const { client, calls } = fakeClient(50);
    await createSupabaseDb(client).select('sessions', { eq: { ended_at: null }, limit: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.range).toBeUndefined();
  });
});
