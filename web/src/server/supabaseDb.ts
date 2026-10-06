import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Db, Query, Row } from './db';

type Scalar = string | number | boolean | null;

function check(error: { message: string } | null): void {
  if (error) throw new Error(`Supabase: ${error.message}`);
}

// supabase-js の型は列定義に依存するため、ここだけ緩く扱う
type Builder = {
  eq(col: string, v: unknown): Builder;
  is(col: string, v: null): Builder;
  gte(col: string, v: unknown): Builder;
  lt(col: string, v: unknown): Builder;
  order(col: string, o: { ascending: boolean }): Builder;
  limit(n: number): Builder;
};

function applyMatch<B extends Builder>(b: B, match: Record<string, Scalar>): B {
  let q: Builder = b;
  for (const [k, v] of Object.entries(match)) q = v === null ? q.is(k, null) : q.eq(k, v);
  return q as B;
}

export function createSupabaseDb(client: SupabaseClient): Db {
  return {
    async select<T = Row>(table: string, q: Query = {}): Promise<T[]> {
      let b = client.from(table).select('*') as unknown as Builder;
      b = applyMatch(b, q.eq ?? {});
      for (const [k, v] of Object.entries(q.gte ?? {})) b = b.gte(k, v);
      for (const [k, v] of Object.entries(q.lt ?? {})) b = b.lt(k, v);
      if (q.order) b = b.order(q.order.col, { ascending: q.order.asc ?? true });
      if (q.limit !== undefined) b = b.limit(q.limit);
      const { data, error } = (await (b as unknown as Promise<{ data: T[] | null; error: { message: string } | null }>));
      check(error);
      return data ?? [];
    },
    async insert<T = Row>(table: string, row: Row): Promise<T> {
      const { data, error } = await client.from(table).insert(row).select().single();
      check(error);
      return data as T;
    },
    async upsert(table, rows, opts) {
      if (rows.length === 0) return;
      const { error } = await client
        .from(table)
        .upsert(rows, { onConflict: opts.onConflict, ignoreDuplicates: opts.ignoreDuplicates ?? false });
      check(error);
    },
    async update<T = Row>(table: string, match: Record<string, Scalar>, patch: Row): Promise<T[]> {
      const b = applyMatch(client.from(table).update(patch) as unknown as Builder, match);
      const { data, error } = await (b as unknown as { select(): Promise<{ data: T[] | null; error: { message: string } | null }> }).select();
      check(error);
      return data ?? [];
    },
    async delete(table, match) {
      const b = applyMatch(client.from(table).delete() as unknown as Builder, match);
      const { error } = await (b as unknown as Promise<{ error: { message: string } | null }>);
      check(error);
    },
  };
}

export function createAdminClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
