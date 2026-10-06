import { dayKey } from '@/lib/jst';
import { daysLeft, doneSince, sortByDue } from '@/lib/tasks';
import type { TaskRow, TaskStatus } from '@/lib/types';
import type { Ctx } from '../context';
import { asObject, badRequest, notFound, str } from '../errors';

export type TaskView = TaskRow & { days_left: number };

const STATUSES: TaskStatus[] = ['todo', 'doing', 'done'];

export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

const view = (rows: TaskRow[], todayKey: string): TaskView[] =>
  sortByDue(rows).map((r) => ({ ...r, days_left: daysLeft(r.due_date, todayKey) }));

/** 期限の近い順。完了は直近2週間ぶんだけ残す */
export async function listTasks(ctx: Ctx): Promise<TaskView[]> {
  const todayKey = dayKey(ctx.now, ctx.config.boundaryMin);
  const all = await ctx.db.select<TaskRow>('tasks');
  const since = doneSince(todayKey);
  return view(
    all.filter((t) => t.status !== 'done' || (t.done_at !== null && dayKey(new Date(t.done_at), ctx.config.boundaryMin) >= since)),
    todayKey,
  );
}

export async function createTask(ctx: Ctx, body: unknown): Promise<TaskRow> {
  const b = asObject(body);
  const title = str(b.title, '課題名', 1, 100);
  if (!isValidDate(b.due_date)) throw badRequest('期限は YYYY-MM-DD の形式で入れてください');
  return ctx.db.insert<TaskRow>('tasks', { title, due_date: b.due_date, status: 'todo', done_at: null, created_at: ctx.now.toISOString() });
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
  const [row] = await ctx.db.update<TaskRow>('tasks', { id }, patch);
  if (!row) throw notFound('課題が見つかりません');
  return row;
}
