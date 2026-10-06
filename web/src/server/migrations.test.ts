import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = join(__dirname, '..', '..');
const sqlDir = join(webRoot, '..', 'supabase', 'migrations');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('マイグレーションとコードの整合', () => {
  const sql = readdirSync(sqlDir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(join(sqlDir, f), 'utf8')).join('\n');
  const created = new Set([...sql.matchAll(/create table\s+(\w+)/gi)].map((m) => m[1]!));
  const rls = new Set([...sql.matchAll(/alter table\s+(\w+)\s+enable row level security/gi)].map((m) => m[1]!));

  const used = new Set<string>();
  for (const file of walk(join(webRoot, 'src', 'server')).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\.(?:select|insert|upsert|update|delete)(?:<[^>(]*>)?\(\s*'([a-z_]+)'/g)) used.add(m[1]!);
  }

  it('コードが使うテーブルを、すべてマイグレーションが作っている', () => {
    expect(used.size).toBeGreaterThan(5);
    for (const t of used) expect(created, `テーブル ${t} のマイグレーションがありません`).toContain(t);
  });

  it('作ったテーブルはすべて RLS が有効', () => {
    for (const t of created) expect(rls, `テーブル ${t} の RLS が無効です`).toContain(t);
  });
});
