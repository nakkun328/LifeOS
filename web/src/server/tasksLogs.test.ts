import { describe, expect, it } from 'vitest';
import { HttpError } from './errors';
import { addLog, listLogs, listTodayLogs } from './handlers/logs';
import { createTask, listTasks, updateTask } from './handlers/tasks';
import { buildToday } from './handlers/today';
import { at, makeTestCtx } from './testing';

const rejects = async (p: Promise<unknown>, status = 400) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(HttpError);
  expect((e as HttpError).status).toBe(status);
};

describe('tasks', () => {
  it('登録して、期限の近い順に残り日数つきで出る', async () => {
    const ctx = makeTestCtx('2026-10-06T12:00:00');
    await createTask(ctx, { title: '英語プリント', due_date: '2026-10-12' });
    await createTask(ctx, { title: '数学レポート', due_date: '2026-10-09' });
    const list = await listTasks(ctx);
    expect(list.map((t) => [t.title, t.days_left])).toEqual([['数学レポート', 3], ['英語プリント', 6]]);
  });

  it('進捗を変えられる。完了にすると done_at が入り、戻すと消える', async () => {
    const ctx = makeTestCtx('2026-10-06T12:00:00');
    const t = await createTask(ctx, { title: 'a', due_date: '2026-10-09' });
    expect((await updateTask(ctx, t.id, { status: 'doing' })).status).toBe('doing');
    const done = await updateTask(ctx, t.id, { status: 'done' });
    expect(done.done_at).not.toBeNull();
    expect((await updateTask(ctx, t.id, { status: 'todo' })).done_at).toBeNull();
    await rejects(updateTask(ctx, t.id, { status: 'nope' }));
    await rejects(updateTask(ctx, 'missing', { status: 'doing' }), 404);
  });

  it('期限切れも一覧に出る（負の残り日数）。完了は2週間後に一覧から消える', async () => {
    const ctx = makeTestCtx('2026-10-06T12:00:00');
    const late = await createTask(ctx, { title: '遅れ', due_date: '2026-10-04' });
    expect((await listTasks(ctx))[0]).toMatchObject({ id: late.id, days_left: -2 });
    await updateTask(ctx, late.id, { status: 'done' });
    expect(await listTasks(ctx)).toHaveLength(1);
    expect(await listTasks(at(ctx, '2026-10-30T12:00:00'))).toHaveLength(0);
  });

  it('不正な入力を拒否する', async () => {
    const ctx = makeTestCtx();
    await rejects(createTask(ctx, { title: '', due_date: '2026-10-09' }));
    await rejects(createTask(ctx, { title: 'a', due_date: '2026-13-40' }));
    await rejects(createTask(ctx, { title: 'a', due_date: '10/9' }));
    await rejects(createTask(ctx, { title: 'a' }));
  });
});

describe('logs', () => {
  it('1行とタグだけで残せる。改行は空白になる', async () => {
    const ctx = makeTestCtx('2026-10-06T20:00:00');
    const l = await addLog(ctx, { tag: '部活', body: '決定事項：\n来週は新入生歓迎の練習' });
    expect(l.body).toBe('決定事項： 来週は新入生歓迎の練習');
    expect(l.log_date).toBe('2026-10-06');
  });

  it('深夜のログは前日の日付になる', async () => {
    const ctx = makeTestCtx('2026-10-07T01:00:00');
    expect((await addLog(ctx, { tag: '日記', body: 'ねむい' })).log_date).toBe('2026-10-06');
  });

  it('日付ごとに見返せる（新しい日が先）。今日のログだけも取れる', async () => {
    const ctx = makeTestCtx('2026-10-05T20:00:00');
    await addLog(ctx, { tag: '趣味', body: 'ギター' });
    await addLog(at(ctx, '2026-10-06T21:00:00'), { tag: '日記', body: '良い日' });
    await addLog(at(ctx, '2026-10-06T22:00:00'), { tag: '部活', body: '練習' });
    const all = await listLogs(at(ctx, '2026-10-06T23:00:00'));
    expect(all.map((l) => l.body)).toEqual(['練習', '良い日', 'ギター']);
    expect((await listTodayLogs(at(ctx, '2026-10-06T23:00:00'))).map((l) => l.body)).toEqual(['練習', '良い日']);
    expect(await listLogs(at(ctx, '2026-10-20T12:00:00'), 7)).toHaveLength(0);
  });

  it('不正なタグ・空・長すぎる本文を拒否する', async () => {
    const ctx = makeTestCtx();
    await rejects(addLog(ctx, { tag: '仕事', body: 'a' }));
    await rejects(addLog(ctx, { tag: '日記', body: '  ' }));
    await rejects(addLog(ctx, { tag: '日記', body: 'あ'.repeat(201) }));
  });
});

describe('Today に課題とログが出る', () => {
  it('期限が近い課題（残り日数つき）と、今日のログ', async () => {
    const ctx = makeTestCtx('2026-10-06T12:00:00');
    for (const [title, due] of [['a', '2026-10-09'], ['b', '2026-10-07'], ['c', '2026-10-30'], ['d', '2026-10-20'], ['e', '2026-10-08']] as const) {
      await createTask(ctx, { title, due_date: due });
    }
    await addLog(ctx, { tag: '趣味', body: 'ピアノ' });
    const t = await buildToday(ctx);
    expect(t.tasks.map((x) => [x.title, x.days_left])).toEqual([['b', 1], ['e', 2], ['a', 3]]);
    expect(t.logsToday.map((l) => l.body)).toEqual(['ピアノ']);
  });
});
