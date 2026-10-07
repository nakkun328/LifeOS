// 英単語の学習（純粋関数）。復習の間隔・状態の遷移・今日の出題の順番を、ここで決める。
import { addDays } from './jst';
import { daysLeft } from './tasks';
import type { WordRow, WordStatus, WordTestRow } from './types';

/**
 * 正解が続くほど間隔が延びる、単純な方式。
 * 連続正解 1回 → 1日後、2回 → 3日後、3回 → 7日後、4回 → 14日後、5回 → 30日後、6回以上 → 60日後。
 * 忘れたら連続正解を 0 に戻し、Weak にして、翌日にもう一度出す。
 */
export const INTERVAL_DAYS = [1, 3, 7, 14, 30, 60] as const;
/** 連続でこの回数正解したら Mastered */
export const MASTER_STREAK = 5;
/** 新しい単語を、1日に出す数の上限（復習の件数がふくらみすぎないように） */
export const NEW_PER_DAY = 10;
/** テスト期限がこの日数以内の単語を、優先して出す */
export const TEST_PRIORITY_DAYS = 14;
export const MAX_WEAKNESS = 5;

export const STATUS_LABEL: Record<WordStatus, string> = {
  new: 'New',
  learning: 'Learning',
  weak: 'Weak',
  review: 'Review',
  mastered: 'Mastered',
};

// ---- まとめて登録 ----

export type ParsedWords = {
  entries: Array<{ word: string; meaning: string }>;
  /** 読み取れなかった行（そのまま返して、画面で見せる） */
  invalid: string[];
  /** 貼り付けの中で重複していた単語（最初の1つだけ登録する） */
  duplicates: string[];
};

const SEPARATOR = /[\t,，:：=＝]/;

/**
 * 複数行の貼り付けを、単語と意味に分ける。1行に1語。
 *  - 区切りは、タブ・カンマ・コロン・イコール（最初の1つ）。例：`apple, りんご`
 *  - 区切りがなければ、最初の空白で分ける。例：`apple りんご`
 *  - 2語以上の熟語は、区切りを入れる。例：`give up, あきらめる`
 */
export function parseWordLines(text: string): ParsedWords {
  const entries: ParsedWords['entries'] = [];
  const invalid: string[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let word: string;
    let meaning: string;
    const sep = SEPARATOR.exec(line);
    if (sep) {
      word = line.slice(0, sep.index);
      meaning = line.slice(sep.index + 1);
    } else {
      const ws = /[\s　]/.exec(line);
      if (!ws) {
        invalid.push(raw);
        continue;
      }
      word = line.slice(0, ws.index);
      meaning = line.slice(ws.index + 1);
    }
    word = word.trim();
    meaning = meaning.trim();
    if (!word || !meaning || word.length > 80 || meaning.length > 200) {
      invalid.push(raw);
      continue;
    }
    const key = normalizeWord(word);
    if (seen.has(key)) {
      duplicates.push(word);
      continue;
    }
    seen.add(key);
    entries.push({ word, meaning });
  }
  return { entries, invalid, duplicates };
}

/** 同じ単語かの判定用（大文字小文字・全角半角を区別しない） */
export const normalizeWord = (w: string): string => w.normalize('NFKC').trim().toLowerCase();

// ---- 復習の結果 → 状態の更新 ----

export type ReviewResult = 'known' | 'forgot';
export type WordPatch = Pick<
  WordRow,
  'status' | 'streak' | 'weakness' | 'correct_count' | 'wrong_count' | 'first_studied' | 'last_studied' | 'next_review'
>;

/** 「覚えてた」「忘れてた」の結果から、回数・状態・苦手度・次回復習日を更新する */
export function nextReviewState(w: WordRow, result: ReviewResult, todayKey: string): WordPatch {
  const base = { first_studied: w.first_studied ?? todayKey, last_studied: todayKey };
  if (result === 'forgot') {
    return {
      ...base,
      status: 'weak',
      streak: 0,
      weakness: Math.min(MAX_WEAKNESS, w.weakness + 1),
      correct_count: w.correct_count,
      wrong_count: w.wrong_count + 1,
      next_review: addDays(todayKey, 1), // 翌日にもう一度。それまで Weak として優先して出す
    };
  }
  const streak = w.streak + 1;
  const interval = INTERVAL_DAYS[Math.min(streak, INTERVAL_DAYS.length) - 1]!;
  return {
    ...base,
    status: streak >= MASTER_STREAK ? 'mastered' : streak >= 2 ? 'review' : 'learning',
    streak,
    weakness: Math.max(0, w.weakness - 1),
    correct_count: w.correct_count + 1,
    wrong_count: w.wrong_count,
    next_review: addDays(todayKey, interval),
  };
}

// ---- 今日の出題 ----

export type QueueItem = WordRow & { reason: 'test' | 'weak' | 'review' | 'new'; test_name: string | null; test_days_left: number | null };

const isNew = (w: WordRow) => w.status === 'new' && w.next_review === null;

/**
 * 今日の復習の順番。
 *  1. テスト期限が近い単語（期限の近いテスト順。未習得のものだけ）
 *  2. Weak の単語（苦手度の高い順）
 *  3. 復習の日が来た単語（古い順）
 *  4. 新しい単語（今日出す上限 NEW_PER_DAY のうち、まだ残っている分だけ）
 */
export function reviewQueue(words: WordRow[], tests: WordTestRow[], todayKey: string): QueueItem[] {
  const testOf = new Map(tests.map((t) => [t.id, t]));
  const introducedToday = words.filter((w) => w.first_studied === todayKey).length;
  const newAllowance = Math.max(0, NEW_PER_DAY - introducedToday);

  const due = words.filter((w) => (isNew(w) ? true : w.next_review !== null && w.next_review <= todayKey));
  const items: Array<QueueItem & { sort: [number, number, number] }> = [];
  for (const w of due) {
    const test = w.test_id ? testOf.get(w.test_id) : undefined;
    const left = test ? daysLeft(test.due_date, todayKey) : null;
    const nearTest = test && w.status !== 'mastered' && left !== null && left >= 0 && left <= TEST_PRIORITY_DAYS;
    const reason: QueueItem['reason'] = nearTest ? 'test' : w.status === 'weak' ? 'weak' : isNew(w) ? 'new' : 'review';
    const rank = { test: 0, weak: 1, review: 2, new: 3 }[reason];
    const within =
      reason === 'test' ? (left ?? 0) : reason === 'weak' ? -w.weakness : reason === 'review' ? Date.parse(w.next_review ?? todayKey) / 86_400_000 : Date.parse(w.created_at) / 86_400_000;
    items.push({ ...w, reason, test_name: test?.name ?? null, test_days_left: left, sort: [rank, within, -w.weakness] });
  }
  items.sort((a, b) => a.sort[0] - b.sort[0] || a.sort[1] - b.sort[1] || a.sort[2] - b.sort[2] || a.created_at.localeCompare(b.created_at));
  let newTaken = 0;
  return items
    .filter((i) => (i.reason === 'new' ? ++newTaken <= newAllowance : true))
    .map(({ sort: _sort, ...rest }) => rest);
}

// ---- 表示用のまとめ ----

export type TestSummary = { id: string; name: string; due_date: string; days_left: number; total: number; unmastered: number };

export type WordsSummary = {
  total: number;
  dueCount: number;
  counts: Record<WordStatus, number>;
  weak: WordRow[];
  tests: TestSummary[];
  /** いちばん近い、これから（今日を含む）のテスト。Today に出す */
  nextTest: TestSummary | null;
};

export function wordsSummary(words: WordRow[], tests: WordTestRow[], todayKey: string): WordsSummary {
  const counts: Record<WordStatus, number> = { new: 0, learning: 0, weak: 0, review: 0, mastered: 0 };
  for (const w of words) counts[w.status] += 1;
  const testSummaries: TestSummary[] = tests
    .map((t) => {
      const mine = words.filter((w) => w.test_id === t.id);
      return {
        id: t.id,
        name: t.name,
        due_date: t.due_date,
        days_left: daysLeft(t.due_date, todayKey),
        total: mine.length,
        unmastered: mine.filter((w) => w.status !== 'mastered').length,
      };
    })
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  return {
    total: words.length,
    dueCount: reviewQueue(words, tests, todayKey).length,
    counts,
    weak: words
      .filter((w) => w.status === 'weak')
      .sort((a, b) => b.weakness - a.weakness || b.wrong_count - a.wrong_count || a.word.localeCompare(b.word)),
    tests: testSummaries,
    nextTest: testSummaries.find((t) => t.days_left >= 0 && t.total > 0) ?? null,
  };
}
