import { addDays } from './jst';
import type { TaskRow } from './types';

/** 期限までの残り日数。今日が期限なら 0、過ぎていれば負 */
export function daysLeft(dueDate: string, todayKey: string): number {
  const ms = Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** 期限の近い順。同じ期限なら未着手・途中を先に、そのあとは作成順 */
export function sortByDue(tasks: TaskRow[]): TaskRow[] {
  const rank = { doing: 0, todo: 1, done: 2 } as const;
  return [...tasks].sort(
    (a, b) =>
      a.due_date.localeCompare(b.due_date) ||
      rank[a.status] - rank[b.status] ||
      a.created_at.localeCompare(b.created_at),
  );
}

/** 未完了のうち、期限の近い順に n 件（Today 用）。期限切れも先頭に出す */
export function upcoming(tasks: TaskRow[], n = 3): TaskRow[] {
  return sortByDue(tasks.filter((t) => t.status !== 'done')).slice(0, n);
}

export const NEXT_STATUS = { todo: 'doing', doing: 'done', done: 'todo' } as const;
export const STATUS_LABEL = { todo: '未着手', doing: '途中', done: '完了' } as const;

/** done を一覧に残す期間（日） */
export const DONE_VISIBLE_DAYS = 14;
export const doneSince = (todayKey: string): string => addDays(todayKey, -DONE_VISIBLE_DAYS);
