import { describe, expect, it } from 'vitest';
import type { JournalRow } from '@/lib/types';
import { handleInteraction, type Interaction } from './discord/handler';
import { HttpError } from './errors';
import { getJournal, listJournal, resetJournal, saveJournal, settleAt } from './handlers/journal';
import { addLog } from './handlers/logs';
import { saveMotivation } from './handlers/motivation';
import { at, iso, makeTestCtx } from './testing';

type Ctx = ReturnType<typeof makeTestCtx>;
const status = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(HttpError);
  return (e as HttpError).status;
};
const entries = (ctx: Ctx) => (ctx.db.tables.journal_entries ?? []) as unknown as JournalRow[];

const MATH = '00000000-0000-4000-8000-000000000001';
const ENG = '00000000-0000-4000-8000-000000000002';

/** 10/6 に数学52分・英語34分、10/5 と 10/6 の就寝、10/5 と 10/6 の YouTube */
async function seed(ctx: Ctx) {
  const t = ctx.db.tables;
  t.subjects = [
    { id: MATH, name: '数学', archived: false, created_at: iso('2026-09-01T00:00:00') },
    { id: ENG, name: '英語', archived: false, created_at: iso('2026-09-01T00:00:00') },
  ];
  t.sessions = [
    { id: 's1', kind: 'study', subject_id: MATH, started_at: iso('2026-10-06T17:00:00'), ended_at: iso('2026-10-06T17:52:00') },
    { id: 's2', kind: 'study', subject_id: ENG, started_at: iso('2026-10-06T18:00:00'), ended_at: iso('2026-10-06T18:34:00') },
  ];
  t.sleep = [
    { id: 'b5', sleep_at: iso('2026-10-05T23:50:00'), wake_at: iso('2026-10-06T06:50:00'), source: 'button' },
    { id: 'b6', sleep_at: iso('2026-10-06T23:32:00'), wake_at: iso('2026-10-07T06:32:00'), source: 'button' },
  ];
  const usage = (start: string, category: string) => ({ device: 'mac', start: iso(start), category, seconds: 60 });
  t.usage = [
    ...Array.from({ length: 60 }, (_, i) => usage(`2026-10-05T10:${String(i).padStart(2, '0')}:00`, 'youtube')),
    ...Array.from({ length: 28 }, (_, i) => usage(`2026-10-06T10:${String(i).padStart(2, '0')}:00`, 'youtube')),
  ];
}

describe('Journal：自動生成', () => {
  it('データのある日は、テンプレートの文で日記ができて、保存される', async () => {
    const ctx = makeTestCtx('2026-10-07T21:00:00');
    await seed(ctx);
    const j = await getJournal(ctx, '2026-10-06');
    expect(j.body.split('\n')).toEqual([
      '今日は数学を52分、英語を34分勉強した。',
      'SNSなどの利用時間は昨日より32分短かった。',
      '就寝は昨日より18分早かった。',
      '睡眠は7時間0分だった。',
    ]);
    expect(j).toMatchObject({ date: '2026-10-06', edited: false, inProgress: false, hasData: true, prev: '2026-10-05', next: '2026-10-07' });
    expect(entries(ctx)).toHaveLength(1);
  });

  it('材料になる完了課題・ログ・決定事項・「日記」タグ（そのまま）も入る。日の区切りは朝6時', async () => {
    const ctx = makeTestCtx('2026-10-06T20:00:00');
    await seed(ctx);
    ctx.db.tables.tasks = [{ id: 't1', title: '数学レポート', due_date: '2026-10-09', status: 'done', done_at: iso('2026-10-06T19:00:00'), created_at: iso('2026-10-01T00:00:00') }];
    await addLog(ctx, { tag: '部活', body: 'メダルゲームの配線が進んだ' });
    await addLog(ctx, { kind: 'decision', title: '文化祭2027', body: '展示のPC更新は保留' });
    await addLog(ctx, { tag: '日記', body: '疲れたけど楽しかった' });
    // 翌朝の3時（まだ10/6の日）に書いた日記
    await addLog(at(ctx, '2026-10-07T03:00:00'), { tag: '日記', body: '夜更かししてしまった' });
    const body = (await getJournal(at(ctx, '2026-10-07T21:00:00'), '2026-10-06')).body;
    expect(body).toContain('課題「数学レポート」を終えた。');
    expect(body).toContain('部活：メダルゲームの配線が進んだ。');
    expect(body).toContain('部活の決定事項：（文化祭2027）展示のPC更新は保留。');
    expect(body.split('\n').slice(-2)).toEqual(['疲れたけど楽しかった', '夜更かししてしまった']);
  });

  it('当日分は、途中であることが分かる書き方になり、開くたびにその時点のデータで作り直す', async () => {
    const ctx = makeTestCtx('2026-10-06T22:00:00');
    await seed(ctx);
    const j1 = await getJournal(ctx);
    expect(j1).toMatchObject({ date: '2026-10-06', inProgress: true, next: null });
    expect(j1.body).toContain('ここまでのSNSなどの利用時間は28分だった。');
    expect(j1.body).not.toContain('就寝'); // まだ寝ていない
    await addLog(ctx, { tag: '趣味', body: '工具を整理した' });
    expect((await getJournal(ctx)).body).toContain('趣味：工具を整理した。');
  });

  it('データのない日は、空の本文を返して、何も保存しない', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    const j = await getJournal(ctx, '2026-10-03');
    expect(j).toMatchObject({ body: '', hasData: false, edited: false });
    expect(entries(ctx)).toHaveLength(0);
  });

  it('未来の日付・不正な日付は受け付けない', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    expect(await status(getJournal(ctx, '2026-10-08'))).toBe(400);
    expect(await status(getJournal(ctx, '2026/10/06'))).toBe(400);
    expect(await status(saveJournal(ctx, '2026-10-08', { body: 'x' }))).toBe(400);
    expect(await status(resetJournal(ctx, '2026-10-08'))).toBe(400);
  });
});

describe('Journal：モチベ', () => {
  it('その日のモチベが1行入る。日付は、記録した日（朝6時区切り）', async () => {
    const ctx = makeTestCtx('2026-10-06T21:00:00');
    await seed(ctx);
    await saveMotivation(ctx, { scores: { phys: 7, game: 4 }, comment: '配線が進んだ' });
    const body = (await getJournal(at(ctx, '2026-10-07T21:00:00'), '2026-10-06')).body;
    expect(body).toContain('モチベーションは 物理部関連7・その他ゲーム4 だった（一言：配線が進んだ）。');
    // 別の日の記録は入らない
    expect((await getJournal(at(ctx, '2026-10-07T21:00:00'), '2026-10-05')).body).not.toContain('モチベーション');
  });
});

describe('Journal：手で編集した内容を保つ', () => {
  it('編集した日記は、データが増えても自動で上書きされない。「自動の文章に戻す」で作り直せる', async () => {
    const ctx = makeTestCtx('2026-10-06T22:00:00');
    await seed(ctx);
    await getJournal(ctx);
    const saved = await saveJournal(ctx, '2026-10-06', { body: '  数学がんばった\nまた明日  ' });
    expect(saved).toMatchObject({ body: '数学がんばった\nまた明日', edited: true });
    await addLog(ctx, { tag: '趣味', body: '工具を整理した' });
    expect(await getJournal(ctx)).toMatchObject({ body: '数学がんばった\nまた明日', edited: true });
    // 日が確定したあとも、一覧を作り直しても、そのまま
    const later = at(ctx, '2026-10-08T09:00:00');
    expect(await getJournal(later, '2026-10-06')).toMatchObject({ body: '数学がんばった\nまた明日', edited: true });
    expect((await listJournal(later)).find((x) => x.date === '2026-10-06')).toMatchObject({ preview: '数学がんばった', edited: true });
    expect(entries(ctx).filter((e) => e.entry_date === '2026-10-06')).toHaveLength(1);

    const back = await resetJournal(later, '2026-10-06');
    expect(back.edited).toBe(false);
    expect(back.body).toContain('今日は数学を52分、英語を34分勉強した。');
    expect(back.body).toContain('趣味：工具を整理した。');
  });

  it('データのない日にも、自分で書ける。長すぎる本文は断る', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    expect(await saveJournal(ctx, '2026-10-03', { body: '旅行の日' })).toMatchObject({ body: '旅行の日', edited: true });
    expect(await getJournal(ctx, '2026-10-03')).toMatchObject({ body: '旅行の日', edited: true });
    expect(await status(saveJournal(ctx, '2026-10-03', { body: 'あ'.repeat(5001) }))).toBe(400);
    expect(await status(saveJournal(ctx, '2026-10-03', {}))).toBe(400);
  });
});

describe('Journal：前日分は朝に確定する', () => {
  it('確定する時刻は、翌日の12:00（JST）', () => {
    expect(settleAt('2026-10-06', 360).toISOString()).toBe(iso('2026-10-07T12:00:00'));
  });

  it('確定前は取り込み直し、確定後に1回作り直したら、あとはデータが増えても変わらない', async () => {
    const ctx = makeTestCtx('2026-10-06T23:00:00');
    await seed(ctx);
    const a = await getJournal(ctx);
    expect(a.body).not.toContain('睡眠は');

    // 翌朝（確定前）：起床の記録が入った分を取り込む
    const morning = at(ctx, '2026-10-07T09:00:00');
    expect((await getJournal(morning, '2026-10-06')).body).toContain('睡眠は7時間0分だった。');

    // 確定の時刻を過ぎて最初に開いたとき、もう1回だけ作り直して確定する
    ctx.db.tables.sessions!.push({ id: 's3', kind: 'study', subject_id: MATH, started_at: iso('2026-10-06T21:00:00'), ended_at: iso('2026-10-06T21:10:00') });
    const noon = at(ctx, '2026-10-07T13:00:00');
    expect((await getJournal(noon, '2026-10-06')).body).toContain('数学を1時間2分');

    // 確定したあとは、あとからデータが増えても、日記は変わらない
    ctx.db.tables.sessions!.push({ id: 's4', kind: 'study', subject_id: ENG, started_at: iso('2026-10-06T22:00:00'), ended_at: iso('2026-10-06T22:30:00') });
    const evening = at(ctx, '2026-10-07T20:00:00');
    const frozen = await getJournal(evening, '2026-10-06');
    expect(frozen.body).toContain('英語を34分');
    expect(frozen.body).not.toContain('英語を1時間');
    expect(entries(ctx)).toHaveLength(1);
  });
});

describe('Journal：一覧', () => {
  it('直近の日記のある日だけ、新しい日が先で並ぶ', async () => {
    const ctx = makeTestCtx('2026-10-07T21:00:00');
    await seed(ctx);
    await saveJournal(ctx, '2026-10-02', { body: '部活の日' });
    const list = await listJournal(ctx, 14);
    expect(list.map((x) => x.date)).toEqual(['2026-10-06', '2026-10-05', '2026-10-02']);
    expect(list[0]).toMatchObject({ preview: '今日は数学を52分、英語を34分勉強した。', edited: false });
    expect(list[2]).toMatchObject({ preview: '部活の日', edited: true });
  });
});

describe('Discord：/journal', () => {
  const cmd: Interaction = { type: 2, member: { user: { id: '9' } }, data: { name: 'journal' } };
  it('今日の日記が出る。記録がなければ案内する', async () => {
    const ctx = makeTestCtx('2026-10-06T22:00:00');
    expect((await handleInteraction(ctx, cmd, '9')).data?.content).toContain('まだ記録がありません');
    await seed(ctx);
    const text = (await handleInteraction(ctx, cmd, '9')).data?.content ?? '';
    expect(text).toContain('日記 2026-10-06');
    expect(text).toContain('今日は数学を52分、英語を34分勉強した。');
  });
});
