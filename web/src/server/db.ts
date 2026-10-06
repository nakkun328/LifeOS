// DB は小さなインターフェースの背後に置く。
// 本番は Supabase（supabaseDb.ts）、テストはメモリ（memoryDb.ts）。
// 行は DB の列名のまま（snake_case）で受け渡す。
export type Row = Record<string, unknown>;
type Scalar = string | number | boolean | null;

export type Query = {
  eq?: Record<string, Scalar>;
  gte?: Record<string, string | number>;
  lt?: Record<string, string | number>;
  order?: { col: string; asc?: boolean };
  limit?: number;
};

export interface Db {
  select<T = Row>(table: string, q?: Query): Promise<T[]>;
  insert<T = Row>(table: string, row: Row): Promise<T>;
  /** onConflict はカンマ区切りの列名。ignoreDuplicates なら既存行を残す */
  upsert(table: string, rows: Row[], opts: { onConflict: string; ignoreDuplicates?: boolean }): Promise<void>;
  update<T = Row>(table: string, match: Record<string, Scalar>, patch: Row): Promise<T[]>;
  delete(table: string, match: Record<string, Scalar>): Promise<void>;
}
