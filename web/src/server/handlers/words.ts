import { dayKey } from '@/lib/jst';
import type { WordRow, WordTestRow } from '@/lib/types';
import { nextReviewState, normalizeWord, parseWordLines, reviewQueue, wordsSummary, type QueueItem, type WordsSummary } from '@/lib/words';
import type { Ctx } from '../context';
import { asObject, badRequest, isUuid, notFound, str } from '../errors';
import { isValidDate } from './tasks';

const todayKey = (ctx: Ctx) => dayKey(ctx.now, ctx.config.boundaryMin);

async function load(ctx: Ctx): Promise<{ words: WordRow[]; tests: WordTestRow[] }> {
  const [words, tests] = await Promise.all([ctx.db.select<WordRow>('english_words'), ctx.db.select<WordTestRow>('word_tests')]);
  return { words, tests };
}

/** 今日の復習の件数・テストまでの日数・苦手な単語・状態ごとの数 */
export async function getWordsSummary(ctx: Ctx): Promise<WordsSummary> {
  const { words, tests } = await load(ctx);
  return wordsSummary(words, tests, todayKey(ctx));
}

/** 今日の復習の出題（優先順）。limit は、一度に取る数 */
export async function getReviewQueue(ctx: Ctx, limit = 30): Promise<QueueItem[]> {
  const { words, tests } = await load(ctx);
  return reviewQueue(words, tests, todayKey(ctx)).slice(0, Math.min(Math.max(Math.floor(limit) || 30, 1), 200));
}

export type AddWordsResult = { added: number; skipped: number; invalid: string[] };

async function testIdOf(ctx: Ctx, v: unknown): Promise<string | null> {
  if (v === undefined || v === null || v === '') return null;
  if (!isUuid(v)) throw badRequest('テストが正しくありません');
  const [t] = await ctx.db.select<WordTestRow>('word_tests', { eq: { id: v }, limit: 1 });
  if (!t) throw notFound('テストが見つかりません');
  return t.id;
}

/**
 * 単語の登録。1語ずつ（word と meaning）でも、複数行の貼り付け（bulk）でもよい。
 * すでにある単語（大文字小文字・全角半角を区別しない）は、登録せずに数える。test_id があれば、そのテストの対象にする。
 */
export async function addWords(ctx: Ctx, body: unknown): Promise<AddWordsResult> {
  const b = asObject(body);
  const test_id = await testIdOf(ctx, b.test_id);
  let entries: Array<{ word: string; meaning: string }>;
  let invalid: string[] = [];
  let skipped = 0;
  if (typeof b.bulk === 'string') {
    const parsed = parseWordLines(b.bulk);
    entries = parsed.entries;
    invalid = parsed.invalid;
    skipped += parsed.duplicates.length;
    if (entries.length === 0 && invalid.length === 0 && parsed.duplicates.length === 0) throw badRequest('単語が入力されていません');
  } else {
    entries = [{ word: str(b.word, '単語', 1, 80), meaning: str(b.meaning, '意味', 1, 200) }];
  }
  if (entries.length > 500) throw badRequest('一度に登録できるのは 500 語までです');

  const existing = new Set((await ctx.db.select<WordRow>('english_words')).map((w) => normalizeWord(w.word)));
  let added = 0;
  for (const e of entries) {
    if (existing.has(normalizeWord(e.word))) {
      skipped += 1;
      continue;
    }
    existing.add(normalizeWord(e.word));
    await ctx.db.insert<WordRow>('english_words', {
      word: e.word,
      meaning: e.meaning,
      status: 'new',
      weakness: 0,
      streak: 0,
      correct_count: 0,
      wrong_count: 0,
      first_studied: null,
      last_studied: null,
      next_review: null,
      test_id,
      created_at: ctx.now.toISOString(),
    });
    added += 1;
  }
  return { added, skipped, invalid };
}

/** 「覚えてた」「忘れてた」。回数・状態・苦手度・次回復習日を更新し、履歴を残す */
export async function reviewWord(ctx: Ctx, body: unknown): Promise<WordRow> {
  const b = asObject(body);
  if (!isUuid(b.word_id)) throw badRequest('単語が正しくありません');
  if (b.result !== 'known' && b.result !== 'forgot') throw badRequest('結果は known か forgot にしてください');
  const [word] = await ctx.db.select<WordRow>('english_words', { eq: { id: b.word_id }, limit: 1 });
  if (!word) throw notFound('単語が見つかりません');
  const patch = nextReviewState(word, b.result, todayKey(ctx));
  const [row] = await ctx.db.update<WordRow>('english_words', { id: word.id }, patch);
  await ctx.db.insert('word_reviews', { word_id: word.id, result: b.result, reviewed_at: ctx.now.toISOString(), created_at: ctx.now.toISOString() });
  return row!;
}

export async function listWordTests(ctx: Ctx): Promise<WordsSummary['tests']> {
  return (await getWordsSummary(ctx)).tests;
}

type Scope = 'none' | 'unassigned' | 'unmastered' | 'all';

/** 対象の単語を決める。word_ids か scope（テスト未設定すべて／未習得すべて／全部） */
async function pick(ctx: Ctx, b: Record<string, unknown>): Promise<string[]> {
  if (Array.isArray(b.word_ids)) {
    const ids = b.word_ids.filter(isUuid);
    if (ids.length !== b.word_ids.length) throw badRequest('単語が正しくありません');
    return ids;
  }
  const scope = (b.scope ?? 'none') as Scope;
  if (!['none', 'unassigned', 'unmastered', 'all'].includes(scope)) throw badRequest('対象の指定が正しくありません');
  if (scope === 'none') return [];
  const words = await ctx.db.select<WordRow>('english_words');
  return words
    .filter((w) => (scope === 'unassigned' ? w.test_id === null : scope === 'unmastered' ? w.status !== 'mastered' : true))
    .map((w) => w.id);
}

async function assign(ctx: Ctx, testId: string, ids: string[]): Promise<number> {
  let n = 0;
  for (const id of ids) {
    const [row] = await ctx.db.update<WordRow>('english_words', { id }, { test_id: testId });
    if (row) n += 1;
  }
  return n;
}

/** テスト（名前と期限）を作る。scope / word_ids を付ければ、単語をまとめて対象にできる */
export async function createWordTest(ctx: Ctx, body: unknown): Promise<{ test: WordTestRow; assigned: number }> {
  const b = asObject(body);
  const name = str(b.name, 'テスト名', 1, 60);
  if (!isValidDate(b.due_date)) throw badRequest('期限は YYYY-MM-DD の形式で入れてください');
  const ids = await pick(ctx, b);
  const test = await ctx.db.insert<WordTestRow>('word_tests', { name, due_date: b.due_date, created_at: ctx.now.toISOString() });
  return { test, assigned: await assign(ctx, test.id, ids) };
}

/** 既存のテストに、単語をまとめて対象として足す（すでに別のテストの単語は、このテストへ移る） */
export async function assignWordsToTest(ctx: Ctx, testId: string, body: unknown): Promise<{ assigned: number }> {
  const [test] = await ctx.db.select<WordTestRow>('word_tests', { eq: { id: testId }, limit: 1 });
  if (!test) throw notFound('テストが見つかりません');
  return { assigned: await assign(ctx, test.id, await pick(ctx, asObject(body))) };
}
