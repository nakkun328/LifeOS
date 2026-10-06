import type { SubjectRow } from '@/lib/types';
import type { Ctx } from '../context';
import { asObject, notFound, str } from '../errors';

export async function listSubjects(ctx: Ctx): Promise<SubjectRow[]> {
  return ctx.db.select<SubjectRow>('subjects', { eq: { archived: false }, order: { col: 'created_at' } });
}

export async function createSubject(ctx: Ctx, body: unknown): Promise<SubjectRow> {
  const name = str(asObject(body).name, '科目名', 1, 40);
  const existing = (await listSubjects(ctx)).find((s) => s.name === name);
  if (existing) return existing; // 同じ名前は作り直さない
  return ctx.db.insert<SubjectRow>('subjects', { name, archived: false });
}

export async function updateSubject(ctx: Ctx, id: string, body: unknown): Promise<SubjectRow> {
  const b = asObject(body);
  const patch: Record<string, unknown> = {};
  if (b.name !== undefined) patch.name = str(b.name, '科目名', 1, 40);
  if (b.archived !== undefined) patch.archived = b.archived === true;
  const [row] = await ctx.db.update<SubjectRow>('subjects', { id }, patch);
  if (!row) throw notFound('科目が見つかりません');
  return row;
}
