import { dayKey } from '@/lib/jst';
import { daysLeft, doneSince, sortByDue } from '@/lib/tasks';
import type { SubjectRow, TaskCategory, TaskRow, TaskStatus } from '@/lib/types';
import type { Ctx } from '../context';
import { asObject, badRequest, isUuid, notFound, optStr, str } from '../errors';

export type TaskView = TaskRow & { days_left: number; subject_name: string | null };

const STATUSES: TaskStatus[] = ['todo', 'doing', 'done'];
const CATEGORIES: TaskCategory[] = ['school', 'club', 'personal'];

export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

const view = (rows: TaskRow[], subjects: SubjectRow[], todayKey: string): TaskView[] =>
  sortByDue(rows).map((r) => ({
    ...r,
    days_left: daysLeft(r.due_date, todayKey),
    subject_name: subjects.find((s) => s.id === r.subject_id)?.name ?? null,
  }));

/** 期限の近い順。完了は直近2週間ぶんだけ残す */
export async function listTasks(ctx: Ctx): Promise<TaskView[]> {
  const todayKey = dayKey(ctx.now, ctx.config.boundaryMin);
  const [all, subjects] = await Promise.all([ctx.db.select<TaskRow>('tasks'), ctx.db.select<SubjectRow>('subjects')]);
  const since = doneSince(todayKey);
  return view(
    all.filter((t) => t.status !== 'done' || (t.done_at !== null && dayKey(new Date(t.done_at), ctx.config.boundaryMin) >= since)),
    subjects,
    todayKey,
  );
}

/** 任意の追加項目。未入力（空・null）は「なし」として扱う。入力されたものだけ検証する */
async function extras(ctx: Ctx, b: Record<string, unknown>, onlyPresent: boolean): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const has = (k: string) => !onlyPresent || b[k] !== undefined;
  const empty = (v: unknown) => v === undefined || v === null || v === '';

  if (has('subject_id')) {
    if (empty(b.subject_id)) out.subject_id = null;
    else {
      if (!isUuid(b.subject_id)) throw badRequest('科目が正しくありません');
      const [subject] = await ctx.db.select<SubjectRow>('subjects', { eq: { id: b.subject_id }, limit: 1 });
      if (!subject) throw notFound('科目が見つかりません');
      out.subject_id = subject.id;
    }
  }
  if (has('category')) {
    if (empty(b.category)) out.category = null;
    else {
      if (!CATEGORIES.includes(b.category as TaskCategory)) throw badRequest('カテゴリは 学校 / 部活 / 個人 から選んでください');
      out.category = b.category;
    }
  }
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

export async function createTask(ctx: Ctx, body: unknown): Promise<TaskRow> {
  const b = asObject(body);
  const title = str(b.title, '課題名', 1, 100);
  if (!isValidDate(b.due_date)) throw badRequest('期限は YYYY-MM-DD の形式で入れてください');
  return ctx.db.insert<TaskRow>('tasks', {
    title,
    due_date: b.due_date,
    status: 'todo',
    done_at: null,
    created_at: ctx.now.toISOString(),
    ...(await extras(ctx, b, true)), // 追加項目は、入力されたものだけ保存する（入れなくても登録できる）
  });
}

export async function updateTask(ctx: Ctx, id: string, body: unknown): Promise<TaskRow> {
  const b = asObject(body);
  const patch: Record<string, unknown> = {};
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status as TaskStatus)) throw badRequest('進捗は todo / doing / done にしてください');
    patch.status = b.status;
    patch.done_at = b.status === 'done' ? ctx.now.toISOString() : null;
  }
  if (b.title !== undefined) patch.title = str(b.title, '課題名', 1, 100);
  if (b.due_date !== undefined) {
    if (!isValidDate(b.due_date)) throw badRequest('期限は YYYY-MM-DD の形式で入れてください');
    patch.due_date = b.due_date;
  }
  Object.assign(patch, await extras(ctx, b, true));
  const [row] = await ctx.db.update<TaskRow>('tasks', { id }, patch);
  if (!row) throw notFound('課題が見つかりません');
  return row;
}
