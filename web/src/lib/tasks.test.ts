import { describe, expect, it } from 'vitest';
import { dueMessage } from './messages';
import { daysLeft, doneSince, NEXT_STATUS, sortByDue, upcoming } from './tasks';
import type { TaskRow } from './types';

const t = (id: string, due: string, status: TaskRow['status'] = 'todo', created = '2026-10-01T00:00:00Z'): TaskRow => ({
  id, title: id, due_date: due, status, created_at: created, done_at: null,
});

describe('daysLeft', () => {
  it('残り日数（月・年をまたぐ）', () => {
    expect(daysLeft('2026-10-09', '2026-10-06')).toBe(3);
    expect(daysLeft('2026-10-06', '2026-10-06')).toBe(0);
    expect(daysLeft('2026-10-04', '2026-10-06')).toBe(-2);
    expect(daysLeft('2026-11-02', '2026-10-30')).toBe(3);
    expect(daysLeft('2027-01-01', '2026-12-31')).toBe(1);
  });
  it('「数学レポート あと3日」のように出せる', () => {
    expect(dueMessage(daysLeft('2026-10-09', '2026-10-06'))).toBe('あと3日');
  });
});

describe('並べ替え', () => {
  it('期限の近い順。同じ期限は途中 → 未着手', () => {
    const sorted = sortByDue([t('c', '2026-10-10'), t('a', '2026-10-08'), t('b2', '2026-10-09'), t('b1', '2026-10-09', 'doing')]);
    expect(sorted.map((x) => x.id)).toEqual(['a', 'b1', 'b2', 'c']);
  });
  it('Today 用は未完了だけ・n件。期限切れも先頭に出る', () => {
    const rows = [t('late', '2026-10-01'), t('done', '2026-10-02', 'done'), t('a', '2026-10-08'), t('b', '2026-10-09'), t('c', '2026-10-20')];
    expect(upcoming(rows, 3).map((x) => x.id)).toEqual(['late', 'a', 'b']);
  });
  it('進捗は 1タップで 未着手 → 途中 → 完了', () => {
    expect(NEXT_STATUS.todo).toBe('doing');
    expect(NEXT_STATUS.doing).toBe('done');
  });
  it('完了の表示期間', () => {
    expect(doneSince('2026-10-15')).toBe('2026-10-01');
  });
});
