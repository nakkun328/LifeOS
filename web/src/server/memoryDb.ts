import { randomUUID } from 'node:crypto';
import type { Db, Query, Row } from './db';

/** テスト用のメモリ実装。Supabase と同じ振る舞い（一意制約での upsert など）を最小限で再現する */
export class MemoryDb implements Db {
  tables: Record<string, Row[]> = {};

  private rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }

  async select<T = Row>(table: string, q: Query = {}): Promise<T[]> {
    let out = this.rows(table).filter((r) => {
      for (const [k, v] of Object.entries(q.eq ?? {})) if ((r[k] ?? null) !== v) return false;
      for (const [k, v] of Object.entries(q.gte ?? {})) if (!((r[k] as string | number) >= v)) return false;
      for (const [k, v] of Object.entries(q.lt ?? {})) if (!((r[k] as string | number) < v)) return false;
      return true;
    });
    if (q.order) {
      const { col, asc = true } = q.order;
      out = [...out].sort((a, b) => {
        const x = String(a[col] ?? '');
        const y = String(b[col] ?? '');
        return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
      });
    }
    if (q.limit !== undefined) out = out.slice(0, q.limit);
    return out.map((r) => ({ ...r })) as T[];
  }

  async insert<T = Row>(table: string, row: Row): Promise<T> {
    const full = { id: randomUUID(), created_at: new Date().toISOString(), ...row };
    this.rows(table).push(full);
    return { ...full } as T;
  }

  async upsert(table: string, rows: Row[], opts: { onConflict: string; ignoreDuplicates?: boolean }): Promise<void> {
    const cols = opts.onConflict.split(',').map((c) => c.trim());
    for (const row of rows) {
      const list = this.rows(table);
      const i = list.findIndex((r) => cols.every((c) => r[c] === row[c]));
      if (i < 0) list.push({ id: randomUUID(), created_at: new Date().toISOString(), ...row });
      else if (!opts.ignoreDuplicates) list[i] = { ...list[i], ...row };
    }
  }

  async update<T = Row>(table: string, match: Record<string, string | number | boolean | null>, patch: Row): Promise<T[]> {
    const hit = this.rows(table).filter((r) => Object.entries(match).every(([k, v]) => (r[k] ?? null) === v));
    for (const r of hit) Object.assign(r, patch);
    return hit.map((r) => ({ ...r })) as T[];
  }

  async delete(table: string, match: Record<string, string | number | boolean | null>): Promise<void> {
    this.tables[table] = this.rows(table).filter((r) => !Object.entries(match).every(([k, v]) => (r[k] ?? null) === v));
  }
}
