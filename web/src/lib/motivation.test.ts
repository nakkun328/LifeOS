import { describe, expect, it } from 'vitest';
import {
  avgScore,
  chartSeries,
  isDateKey,
  mergeRecord,
  motivBar,
  MOTIV_ITEMS,
  parseImport,
  sameRecord,
  validateScores,
  type MotivRecord,
} from './motivation';

const rec = (date: string, scores: MotivRecord['scores'], comment: string | null = null): MotivRecord => ({ record_date: date, scores, comment });

describe('項目の定義（旧アプリのまま）', () => {
  it('キー・表示名・分類・色', () => {
    expect(MOTIV_ITEMS.map((i) => [i.key, i.label, i.group, i.color])).toEqual([
      ['phys', '物理部関連', 'dev', '#5ab4f0'],
      ['photo', '写真', 'dev', '#38d9c0'],
      ['video', '動画編集', 'dev', '#7ecff5'],
      ['baseball', '野球観戦', 'hobby', '#8b9fff'],
      ['prospi', 'プロスピ', 'hobby', '#c07aff'],
      ['game', 'その他ゲーム', 'hobby', '#ff8ab4'],
    ]);
  });
});

describe('点数の検証', () => {
  it('1〜10 の整数だけ。欠け（キーなし・null）は欠けのまま', () => {
    expect(validateScores({ phys: 7, game: 1, photo: 10 })).toEqual({ scores: { phys: 7, game: 1, photo: 10 } });
    expect(validateScores({ phys: 7, photo: null })).toEqual({ scores: { phys: 7 } });
    expect(validateScores({})).toEqual({ scores: {} });
  });
  it('範囲外・小数・文字列・未知のキーは拒否する', () => {
    for (const bad of [{ phys: 0 }, { phys: 11 }, { phys: 5.5 }, { phys: '7' }, { phys: NaN }, { music: 5 }, [], null, 'x']) {
      expect(validateScores(bad)).toHaveProperty('error');
    }
  });
  it('日付の形式', () => {
    expect(isDateKey('2026-10-07')).toBe(true);
    for (const bad of ['2026-10-7', '2026/10/07', '2026-02-30', '', 20261007, null]) expect(isDateKey(bad)).toBe(false);
  });
});

describe('マージ', () => {
  const a = rec('2026-10-06', { phys: 5, photo: 6 }, '既存のメモ');
  const b = rec('2026-10-06', { photo: 9, game: 3 }, null);
  it('項目ごとに重ねる。同じ項目は、選んだ側を残す', () => {
    expect(mergeRecord(a, b, 'incoming')).toEqual(rec('2026-10-06', { phys: 5, photo: 9, game: 3 }, '既存のメモ'));
    expect(mergeRecord(a, b, 'existing')).toEqual(rec('2026-10-06', { phys: 5, photo: 6, game: 3 }, '既存のメモ'));
  });
  it('メモは、両方にあって違うときだけ選んだ側。片方だけならそれを残す', () => {
    expect(mergeRecord(rec('d', {}, 'A'), rec('d', {}, 'B'), 'incoming').comment).toBe('B');
    expect(mergeRecord(rec('d', {}, 'A'), rec('d', {}, 'B'), 'existing').comment).toBe('A');
    expect(mergeRecord(rec('d', {}, null), rec('d', {}, 'B'), 'existing').comment).toBe('B');
  });
  it('同じものを何度重ねても変わらない（べき等）', () => {
    for (const prefer of ['existing', 'incoming'] as const) {
      const once = mergeRecord(a, b, prefer);
      expect(sameRecord(mergeRecord(once, b, prefer), once)).toBe(true);
    }
  });
});

describe('平均とバー', () => {
  it('記録のある項目だけで平均する', () => {
    expect(avgScore({ phys: 8, photo: 4 })).toBe(6);
    expect(avgScore({})).toBeNull();
  });
  it('8マスのバー', () => {
    expect(motivBar(7)).toBe('■■■■■■□□');
    expect(motivBar(10)).toBe('■■■■■■■■');
    expect(motivBar(1)).toBe('■□□□□□□□');
    expect(motivBar(5)).toBe('■■■■□□□□');
  });
});

describe('取り込みの読み取り', () => {
  it('旧アプリの形（{date, scores, comment} の配列）を読み、日付順に並べる', () => {
    const r = parseImport(JSON.stringify([
      { date: '2026-10-02', scores: { phys: 7, photo: 5, video: 6, baseball: 8, prospi: 4, game: 5 }, comment: '良い日' },
      { date: '2026-10-01', scores: { phys: 3 } },
    ]));
    if ('error' in r) throw new Error(r.error);
    expect(r.records.map((x) => x.record_date)).toEqual(['2026-10-01', '2026-10-02']);
    expect(r.records[0]).toEqual({ record_date: '2026-10-01', scores: { phys: 3 }, comment: null });
    expect(r.invalid).toEqual([]);
    expect(r.total).toBe(2);
  });

  it('不正な行は取り込まず、行番号と理由を返す（ほかの行は読む）', () => {
    const r = parseImport(JSON.stringify([
      { date: '2026-10-01', scores: { phys: 11 } },
      { date: '2026/10/02', scores: { phys: 5 } },
      { date: '2026-10-03', scores: { music: 5 } },
      { date: '2026-10-04', scores: { phys: 5.5 } },
      { date: '2026-10-05', scores: {} },
      { date: '2026-10-06', scores: { phys: 5 }, comment: 123 },
      'x',
      { date: '2026-10-07', scores: { phys: 6 } },
    ]));
    if ('error' in r) throw new Error(r.error);
    expect(r.records).toEqual([rec('2026-10-07', { phys: 6 })]);
    expect(r.invalid.map((x) => x.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(r.total).toBe(8);
  });

  it('メモだけの日も取り込める。同じ日付が複数あれば、項目ごとにまとめる', () => {
    const r = parseImport(JSON.stringify([
      { date: '2026-10-01', scores: { phys: 5 } },
      { date: '2026-10-01', scores: { photo: 6 }, comment: ' メモ ' },
      { date: '2026-10-02', scores: {}, comment: 'メモだけ' },
    ]));
    if ('error' in r) throw new Error(r.error);
    expect(r.records).toEqual([rec('2026-10-01', { phys: 5, photo: 6 }, 'メモ'), rec('2026-10-02', {}, 'メモだけ')]);
    expect(r.duplicateDates).toBe(1);
  });

  it('JSON でない・配列でないときは、エラーを返す。{records: […]} の形も読める', () => {
    expect(parseImport('これはJSONではない')).toHaveProperty('error');
    expect(parseImport('{"a":1}')).toHaveProperty('error');
    const ok = parseImport('{"records":[{"date":"2026-10-01","scores":{"phys":5}}]}');
    expect('error' in ok).toBe(false);
  });
});

describe('グラフの集計', () => {
  const records = [
    rec('2026-10-01', { phys: 4, photo: 6 }),
    rec('2026-10-05', { phys: 8 }),
    rec('2026-10-07', { phys: 6, photo: 2, game: 9 }),
  ];
  it('7日：今日までの7日。記録のない日は null（0 や 5 で埋めない）。平均は記録のある日だけ', () => {
    const c = chartSeries(records, 7, '2026-10-07');
    expect(c.dates).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07']);
    const phys = c.items.find((i) => i.key === 'phys')!;
    expect(phys.points).toEqual([4, null, null, null, 8, null, 6]);
    expect(phys.avg).toBe(6);
    expect(phys.n).toBe(3);
    expect(c.items.find((i) => i.key === 'photo')!.points).toEqual([6, null, null, null, null, null, 2]);
    expect(c.items.find((i) => i.key === 'game')!.avg).toBe(9);
    expect(c.items.find((i) => i.key === 'video')).toMatchObject({ avg: null, n: 0 });
  });
  it('期間で切る。全期間は最初の記録の日から', () => {
    expect(chartSeries(records, 7, '2026-10-12').dates).toHaveLength(7);
    expect(chartSeries(records, 7, '2026-10-12').items.find((i) => i.key === 'phys')!.n).toBe(1); // 10/6〜10/12 のうち 10/7 だけ
    const all = chartSeries(records, 'all', '2026-10-07');
    expect(all.dates[0]).toBe('2026-10-01');
    expect(all.dates).toHaveLength(7);
    expect(chartSeries(records, 30, '2026-10-07').dates).toHaveLength(30);
  });
  it('記録がなければ空', () => {
    expect(chartSeries([], 30, '2026-10-07').dates).toEqual([]);
  });
});
