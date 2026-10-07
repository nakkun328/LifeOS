import { describe, expect, it } from 'vitest';
import type { WordRow, WordTestRow } from './types';
import { INTERVAL_DAYS, MASTER_STREAK, NEW_PER_DAY, nextReviewState, parseWordLines, reviewQueue, wordsSummary } from './words';

const TODAY = '2026-10-07';
const w = (word: string, over: Partial<WordRow> = {}): WordRow => ({
  id: word, word, meaning: `${word}の意味`, weakness: 0, status: 'new', streak: 0, correct_count: 0, wrong_count: 0,
  first_studied: null, last_studied: null, next_review: null, test_id: null, created_at: '2026-10-01T00:00:00Z', ...over,
});
const test = (id: string, due: string): WordTestRow => ({ id, name: `テスト${id}`, due_date: due, created_at: '' });

describe('parseWordLines（まとめて貼り付け）', () => {
  it('区切りは、カンマ・タブ・コロン・イコール・空白', () => {
    const r = parseWordLines('apple, りんご\nbanana\tバナナ\ncherry：さくらんぼ\ngrape=ぶどう\nlemon レモン');
    expect(r.entries).toEqual([
      { word: 'apple', meaning: 'りんご' },
      { word: 'banana', meaning: 'バナナ' },
      { word: 'cherry', meaning: 'さくらんぼ' },
      { word: 'grape', meaning: 'ぶどう' },
      { word: 'lemon', meaning: 'レモン' },
    ]);
    expect(r.invalid).toEqual([]);
  });
  it('熟語は、区切りを入れれば登録できる。意味に「、」があってもよい', () => {
    expect(parseWordLines('give up, あきらめる\napple, りんご、果物').entries).toEqual([
      { word: 'give up', meaning: 'あきらめる' },
      { word: 'apple', meaning: 'りんご、果物' },
    ]);
  });
  it('空行は飛ばす。読み取れない行は invalid に返す', () => {
    const r = parseWordLines('\napple, りんご\n\nonlyword\n, 意味だけ\nword,\n');
    expect(r.entries).toHaveLength(1);
    expect(r.invalid).toEqual(['onlyword', ', 意味だけ', 'word,']);
  });
  it('貼り付けの中の重複は、最初の1つだけ（大文字小文字・全角半角は区別しない）', () => {
    const r = parseWordLines('Apple, りんご\napple, 林檎\nＡＰＰＬＥ, アップル');
    expect(r.entries).toEqual([{ word: 'Apple', meaning: 'りんご' }]);
    expect(r.duplicates).toEqual(['apple', 'ＡＰＰＬＥ']);
  });
  it('長すぎる単語・意味は invalid', () => {
    expect(parseWordLines(`${'a'.repeat(81)}, x`).invalid).toHaveLength(1);
    expect(parseWordLines(`a, ${'あ'.repeat(201)}`).invalid).toHaveLength(1);
  });
});

describe('nextReviewState（結果から更新）', () => {
  it('正解が続くほど、間隔が延びる（1・3・7・14・30・60日）', () => {
    let cur = w('a');
    const gaps: number[] = [];
    for (let i = 0; i < 7; i++) {
      const p = nextReviewState(cur, 'known', TODAY);
      gaps.push((Date.parse(p.next_review!) - Date.parse(TODAY)) / 86_400_000);
      cur = { ...cur, ...p };
    }
    expect(gaps).toEqual([1, 3, 7, 14, 30, 60, 60]);
    expect(INTERVAL_DAYS).toEqual([1, 3, 7, 14, 30, 60]);
  });

  it('状態：1回 Learning → 2回 Review → 5回連続 Mastered', () => {
    let cur = w('a');
    const states: string[] = [];
    for (let i = 0; i < MASTER_STREAK; i++) {
      cur = { ...cur, ...nextReviewState(cur, 'known', TODAY) };
      states.push(cur.status);
    }
    expect(states).toEqual(['learning', 'review', 'review', 'review', 'mastered']);
  });

  it('回数・最終学習日・最初に学習した日が更新される。最初の日は変わらない', () => {
    const p1 = nextReviewState(w('a'), 'known', '2026-10-05');
    expect(p1).toMatchObject({ correct_count: 1, wrong_count: 0, first_studied: '2026-10-05', last_studied: '2026-10-05' });
    const p2 = nextReviewState({ ...w('a'), ...p1 }, 'forgot', '2026-10-07');
    expect(p2).toMatchObject({ correct_count: 1, wrong_count: 1, first_studied: '2026-10-05', last_studied: '2026-10-07' });
  });

  it('忘れたら Weak。連続正解が 0 に戻り、苦手度が上がり、翌日にもう一度出る', () => {
    const cur = w('a', { status: 'review', streak: 3, weakness: 1, correct_count: 3, first_studied: '2026-10-01' });
    expect(nextReviewState(cur, 'forgot', TODAY)).toMatchObject({ status: 'weak', streak: 0, weakness: 2, wrong_count: 1, next_review: '2026-10-08' });
  });

  it('Mastered の単語も、忘れたら Weak に戻る。苦手度は 5 まで', () => {
    expect(nextReviewState(w('a', { status: 'mastered', streak: 6, weakness: 0 }), 'forgot', TODAY).status).toBe('weak');
    expect(nextReviewState(w('a', { status: 'weak', weakness: 5 }), 'forgot', TODAY).weakness).toBe(5);
  });

  it('Weak から1回正解すると Learning に戻り、苦手度が下がる。0 未満にはならない', () => {
    const p = nextReviewState(w('a', { status: 'weak', weakness: 2, streak: 0 }), 'known', TODAY);
    expect(p).toMatchObject({ status: 'learning', weakness: 1, streak: 1, next_review: '2026-10-08' });
    expect(nextReviewState(w('a', { weakness: 0 }), 'known', TODAY).weakness).toBe(0);
  });
});

describe('reviewQueue（今日の復習の順番）', () => {
  it('復習の日が来たものと、新しい単語だけが出る（まだ先のものは出ない）', () => {
    const words = [
      w('due', { status: 'review', next_review: '2026-10-06', streak: 2 }),
      w('today', { status: 'learning', next_review: TODAY, streak: 1 }),
      w('later', { status: 'review', next_review: '2026-10-09', streak: 2 }),
      w('fresh'),
    ];
    expect(reviewQueue(words, [], TODAY).map((x) => x.word)).toEqual(['due', 'today', 'fresh']);
  });

  it('順番：テスト期限が近い → Weak → 復習の日が来た → 新しい単語', () => {
    const tests = [test('t1', '2026-10-10')];
    const words = [
      w('new1', { created_at: '2026-10-01T00:00:00Z' }),
      w('review1', { status: 'review', next_review: '2026-10-05', streak: 2 }),
      w('weak1', { status: 'weak', weakness: 2, next_review: TODAY }),
      w('testword', { status: 'learning', next_review: TODAY, test_id: 't1', streak: 1 }),
    ];
    expect(reviewQueue(words, tests, TODAY).map((x) => [x.word, x.reason])).toEqual([
      ['testword', 'test'], ['weak1', 'weak'], ['review1', 'review'], ['new1', 'new'],
    ]);
  });

  it('テストは期限の近い順。苦手度の高い Weak が先', () => {
    const tests = [test('near', '2026-10-09'), test('far', '2026-10-20')];
    const words = [
      w('far1', { status: 'learning', next_review: TODAY, test_id: 'far' }),
      w('near1', { status: 'learning', next_review: TODAY, test_id: 'near' }),
      w('weakA', { status: 'weak', weakness: 1, next_review: TODAY }),
      w('weakB', { status: 'weak', weakness: 4, next_review: TODAY }),
    ];
    const q = reviewQueue(words, tests, TODAY).map((x) => x.word);
    expect(q.slice(0, 2)).toEqual(['near1', 'far1']);
    expect(q.slice(2)).toEqual(['weakB', 'weakA']);
  });

  it('テスト期限が遠い・過ぎた単語は、テスト優先にしない。習得済みも優先しない', () => {
    const tests = [test('past', '2026-10-01'), test('soon', '2026-10-09')];
    const words = [
      w('pastword', { status: 'review', next_review: TODAY, test_id: 'past' }),
      w('mastered', { status: 'mastered', next_review: TODAY, test_id: 'soon', streak: 6 }),
    ];
    expect(reviewQueue(words, tests, TODAY).map((x) => x.reason)).toEqual(['review', 'review']);
  });

  it(`新しい単語は 1日 ${NEW_PER_DAY} 語まで。今日すでに始めた分は引く`, () => {
    const fresh = Array.from({ length: 25 }, (_, i) => w(`n${String(i).padStart(2, '0')}`, { created_at: `2026-10-01T00:00:${String(i).padStart(2, '0')}Z` }));
    expect(reviewQueue(fresh, [], TODAY)).toHaveLength(NEW_PER_DAY);
    const startedToday = Array.from({ length: 4 }, (_, i) => w(`s${i}`, { status: 'learning', first_studied: TODAY, next_review: '2026-10-08', streak: 1 }));
    expect(reviewQueue([...startedToday, ...fresh], [], TODAY)).toHaveLength(NEW_PER_DAY - 4);
    const all = Array.from({ length: NEW_PER_DAY }, (_, i) => w(`d${i}`, { status: 'learning', first_studied: TODAY, next_review: '2026-10-08', streak: 1 }));
    expect(reviewQueue([...all, ...fresh], [], TODAY)).toHaveLength(0);
  });

  it('新しい単語は、登録が古い順。理由とテスト名が付く', () => {
    const q = reviewQueue([w('b', { created_at: '2026-10-02T00:00:00Z' }), w('a', { created_at: '2026-10-01T00:00:00Z' })], [], TODAY);
    expect(q.map((x) => x.word)).toEqual(['a', 'b']);
    const tq = reviewQueue([w('t', { status: 'learning', next_review: TODAY, test_id: 'x' })], [test('x', '2026-10-09')], TODAY);
    expect(tq[0]).toMatchObject({ reason: 'test', test_name: 'テストx', test_days_left: 2 });
  });
});

describe('wordsSummary', () => {
  const tests = [test('a', '2026-10-11'), test('old', '2026-10-01')];
  const words = [
    w('w1', { status: 'learning', test_id: 'a', next_review: '2026-10-08' }),
    w('w2', { status: 'weak', weakness: 3, test_id: 'a', next_review: TODAY }),
    w('w3', { status: 'mastered', test_id: 'a', next_review: '2026-12-01', streak: 6 }),
    w('w4', { status: 'weak', weakness: 1, next_review: TODAY }),
    w('w5'),
  ];
  const s = wordsSummary(words, tests, TODAY);

  it('今日の復習の件数と、状態ごとの数', () => {
    expect(s.dueCount).toBe(3); // w2, w4, w5(new)
    expect(s.counts).toEqual({ new: 1, learning: 1, weak: 2, review: 0, mastered: 1 });
    expect(s.total).toBe(5);
  });
  it('Weak の一覧は、苦手度の高い順', () => {
    expect(s.weak.map((x) => x.word)).toEqual(['w2', 'w4']);
  });
  it('テスト：あと何日・対象の語数・未習得の語数。いちばん近い、これからのテストを出す', () => {
    expect(s.nextTest).toMatchObject({ name: 'テストa', days_left: 4, total: 3, unmastered: 2 });
    expect(s.tests.map((t) => t.name)).toEqual(['テストold', 'テストa']);
  });
  it('単語がないテストは、Today に出さない', () => {
    expect(wordsSummary([], [test('e', '2026-10-09')], TODAY).nextTest).toBeNull();
  });
});
