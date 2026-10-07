import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { WordRow } from '@/lib/types';
import { handleInteraction, type Interaction } from './discord/handler';
import { HttpError } from './errors';
import { addWords, assignWordsToTest, createWordTest, getReviewQueue, getWordsSummary, reviewWord } from './handlers/words';
import { buildToday } from './handlers/today';
import { at, makeTestCtx } from './testing';

const status = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(HttpError);
  return (e as HttpError).status;
};
const words = (ctx: ReturnType<typeof makeTestCtx>) => (ctx.db.tables.english_words ?? []) as unknown as WordRow[];
const find = (ctx: ReturnType<typeof makeTestCtx>, w: string) => words(ctx).find((x) => x.word === w)!;

describe('English Words：登録', () => {
  it('1語ずつ追加できる。最初は New', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    expect(await addWords(ctx, { word: 'apple', meaning: 'りんご' })).toEqual({ added: 1, skipped: 0, invalid: [] });
    expect(find(ctx, 'apple')).toMatchObject({ status: 'new', weakness: 0, correct_count: 0, wrong_count: 0, next_review: null, last_studied: null, test_id: null });
  });

  it('複数行をまとめて貼り付けて登録できる。読み取れない行は返す', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    const r = await addWords(ctx, { bulk: 'apple, りんご\nbanana バナナ\n\ngive up\t諦める\nonlyword' });
    expect(r).toEqual({ added: 3, skipped: 0, invalid: ['onlyword'] });
    expect(words(ctx).map((w) => w.word).sort()).toEqual(['apple', 'banana', 'give up']);
  });

  it('すでにある単語は登録しない（大文字小文字・全角半角を区別しない）。貼り付けの重複も数える', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    await addWords(ctx, { word: 'apple', meaning: 'りんご' });
    const r = await addWords(ctx, { bulk: 'Apple, 林檎\ncherry, さくらんぼ\nCherry, 桜桃' });
    expect(r).toEqual({ added: 1, skipped: 2, invalid: [] });
    expect(words(ctx)).toHaveLength(2);
  });

  it('入力を検証する', async () => {
    const ctx = makeTestCtx();
    expect(await status(addWords(ctx, {}))).toBe(400);
    expect(await status(addWords(ctx, { word: 'a' }))).toBe(400);
    expect(await status(addWords(ctx, { bulk: '' }))).toBe(400);
    expect(await status(addWords(ctx, { word: 'a', meaning: 'b', test_id: 'x' }))).toBe(400);
    expect(await status(addWords(ctx, { word: 'a', meaning: 'b', test_id: randomUUID() }))).toBe(404);
  });
});

describe('English Words：テスト', () => {
  it('テスト（名前と期限）を作り、単語をまとめて対象にできる', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    await addWords(ctx, { bulk: 'a, あ\nb, い\nc, う' });
    const { test, assigned } = await createWordTest(ctx, { name: '中間テスト', due_date: '2026-10-11', scope: 'unassigned' });
    expect(assigned).toBe(3);
    expect(words(ctx).every((w) => w.test_id === test.id)).toBe(true);
  });

  it('登録と同時に、テストの対象にできる。あとから足すこともできる', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    const { test } = await createWordTest(ctx, { name: '小テスト', due_date: '2026-10-09' });
    await addWords(ctx, { bulk: 'a, あ\nb, い', test_id: test.id });
    await addWords(ctx, { word: 'c', meaning: 'う' });
    expect(words(ctx).filter((w) => w.test_id === test.id)).toHaveLength(2);
    expect(await assignWordsToTest(ctx, test.id, { scope: 'unassigned' })).toEqual({ assigned: 1 });
    expect(words(ctx).filter((w) => w.test_id === test.id)).toHaveLength(3);
  });

  it('「未習得をまとめて」は、習得済みの単語を含めない', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    await addWords(ctx, { bulk: 'a, あ\nb, い' });
    ctx.db.tables.english_words![0]!.status = 'mastered';
    const { test, assigned } = await createWordTest(ctx, { name: 't', due_date: '2026-10-09', scope: 'unmastered' });
    expect(assigned).toBe(1);
    expect(words(ctx).filter((w) => w.test_id === test.id)).toHaveLength(1);
  });

  it('不正な期限・対象を拒否する', async () => {
    const ctx = makeTestCtx();
    expect(await status(createWordTest(ctx, { name: 't', due_date: '10/9' }))).toBe(400);
    expect(await status(createWordTest(ctx, { name: '', due_date: '2026-10-09' }))).toBe(400);
    expect(await status(createWordTest(ctx, { name: 't', due_date: '2026-10-09', scope: 'everything' }))).toBe(400);
    expect(await status(assignWordsToTest(ctx, randomUUID(), { scope: 'all' }))).toBe(404);
  });
});

describe('English Words：復習（2択）', () => {
  it('「覚えてた」で、正答回数・状態・最終学習日・次回復習日が更新される。履歴が残る', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    await addWords(ctx, { word: 'apple', meaning: 'りんご' });
    const w = find(ctx, 'apple');
    const r = await reviewWord(ctx, { word_id: w.id, result: 'known' });
    expect(r).toMatchObject({ status: 'learning', correct_count: 1, wrong_count: 0, streak: 1, last_studied: '2026-10-07', next_review: '2026-10-08' });
    expect(ctx.db.tables.word_reviews).toHaveLength(1);
    expect(ctx.db.tables.word_reviews![0]).toMatchObject({ word_id: w.id, result: 'known' });
  });

  it('正解が続くほど、次の復習が遠くなる（日付は朝6時区切り）', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    await addWords(ctx, { word: 'apple', meaning: 'りんご' });
    const id = find(ctx, 'apple').id;
    const dates: string[] = [];
    for (const day of ['2026-10-07', '2026-10-08', '2026-10-11', '2026-10-18']) {
      const r = await reviewWord(at(ctx, `${day}T10:00:00`), { word_id: id, result: 'known' });
      dates.push(r.next_review!);
    }
    expect(dates).toEqual(['2026-10-08', '2026-10-11', '2026-10-18', '2026-11-01']);
  });

  it('深夜（0時過ぎ）の復習は、前日として数える', async () => {
    const ctx = makeTestCtx('2026-10-08T00:30:00');
    await addWords(ctx, { word: 'apple', meaning: 'りんご' });
    const r = await reviewWord(ctx, { word_id: find(ctx, 'apple').id, result: 'known' });
    expect(r.last_studied).toBe('2026-10-07');
    expect(r.next_review).toBe('2026-10-08');
  });

  it('「忘れてた」で Weak になり、誤答回数・苦手度が上がり、翌日に出し直す', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    await addWords(ctx, { word: 'apple', meaning: 'りんご' });
    const id = find(ctx, 'apple').id;
    const r = await reviewWord(ctx, { word_id: id, result: 'forgot' });
    expect(r).toMatchObject({ status: 'weak', wrong_count: 1, weakness: 1, streak: 0, next_review: '2026-10-08' });
    expect((await getWordsSummary(ctx)).weak.map((w) => w.word)).toEqual(['apple']);
  });

  it('不正な入力を拒否する', async () => {
    const ctx = makeTestCtx();
    expect(await status(reviewWord(ctx, { word_id: 'x', result: 'known' }))).toBe(400);
    expect(await status(reviewWord(ctx, { word_id: randomUUID(), result: 'maybe' }))).toBe(400);
    expect(await status(reviewWord(ctx, { word_id: randomUUID(), result: 'known' }))).toBe(404);
  });
});

describe('English Words：今日の復習の出題と Today', () => {
  it('間違えた単語は、優先して出る。テストが近い単語はさらに先', async () => {
    const ctx = makeTestCtx('2026-10-06T12:00:00');
    await addWords(ctx, { bulk: 'alpha, あ\nbeta, い\ngamma, う\ndelta, え' });
    const day1 = at(ctx, '2026-10-06T12:00:00');
    await reviewWord(day1, { word_id: find(ctx, 'alpha').id, result: 'known' });
    await reviewWord(day1, { word_id: find(ctx, 'beta').id, result: 'forgot' });
    await reviewWord(day1, { word_id: find(ctx, 'gamma').id, result: 'known' });
    await createWordTest(ctx, { name: '小テスト', due_date: '2026-10-09', word_ids: [find(ctx, 'gamma').id] });
    const q = await getReviewQueue(at(ctx, '2026-10-07T12:00:00'));
    expect(q.map((x) => [x.word, x.reason])).toEqual([['gamma', 'test'], ['beta', 'weak'], ['alpha', 'review'], ['delta', 'new']]);
    expect(q[0]).toMatchObject({ test_name: '小テスト', test_days_left: 2 });
  });

  it('Today に「今日の復習 N語」と「テストまでの日数・未習得」が出る', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    const empty = await buildToday(ctx);
    expect(empty.words).toEqual({ total: 0, dueCount: 0, nextTest: null });
    await addWords(ctx, { bulk: 'a, あ\nb, い\nc, う' });
    await createWordTest(ctx, { name: '中間テスト', due_date: '2026-10-11', scope: 'unassigned' });
    const t = await buildToday(ctx);
    expect(t.words).toEqual({ total: 3, dueCount: 3, nextTest: { name: '中間テスト', days_left: 4, unmastered: 3 } });
    await reviewWord(ctx, { word_id: find(ctx, 'a').id, result: 'known' });
    expect((await buildToday(ctx)).words.dueCount).toBe(2);
  });

  it('復習を終えた単語は、その日の件数から減る。新しい単語は 1日10語まで', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    await addWords(ctx, { bulk: Array.from({ length: 25 }, (_, i) => `w${String(i).padStart(2, '0')}, 意味${i}`).join('\n') });
    expect((await buildToday(ctx)).words.dueCount).toBe(10);
    const first = (await getReviewQueue(ctx))[0]!;
    await reviewWord(ctx, { word_id: first.id, result: 'known' });
    expect((await buildToday(ctx)).words.dueCount).toBe(9); // 今日始めた1語を引いた分だけ、新しい単語が出る
  });
});

describe('Discord：/words', () => {
  const cmd: Interaction = { type: 2, member: { user: { id: '9' } }, data: { name: 'words' } };
  it('今日の復習の件数と、テストまでの日数が出る', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    await addWords(ctx, { bulk: 'a, あ\nb, い' });
    await createWordTest(ctx, { name: '中間テスト', due_date: '2026-10-11', scope: 'unassigned' });
    const text = (await handleInteraction(ctx, cmd, '9')).data?.content ?? '';
    expect(text).toContain('今日の復習 2語');
    expect(text).toContain('中間テスト');
    expect(text).toContain('あと4日・未習得 2語');
  });
  it('単語がないときの案内', async () => {
    expect((await handleInteraction(makeTestCtx(), cmd, '9')).data?.content).toContain('まだ単語がありません');
  });
});
