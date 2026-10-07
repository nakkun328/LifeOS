import { describe, expect, it } from 'vitest';
import {
  bedVsNextDay,
  bandOf,
  buildInsights,
  digitalVsBed,
  motivationInsights,
  efficiencyByBand,
  efficiencyByLength,
  lengthOf,
  MIN,
  pickTop,
  weekComparison,
  weekHeadline,
  weekLines,
  type DayFacts,
  type EffSession,
  type WeekMetric,
} from './insights';
import { addDays } from './jst';

const TODAY = '2026-10-07'; // 水曜。今週は 10/5（月）から、先週は 9/28（月）から
const day = (date: string, o: Partial<DayFacts> = {}): DayFacts => ({ date, studyMin: 0, digitalMin: null, bedMin: null, sleepMin: null, complete: date < TODAY, ...o });
const sess = (subject: string, startHour: number, minutes: number, efficiency: number, date = '2026-10-01'): EffSession => ({ subject, date, startHour, minutes, efficiency });
/** 23:50 = 正午起点で 710 分 */
const bed = (hh: number, mm: number) => ((hh * 60 + mm - 720 + 1440) % 1440);

describe('今週と先週', () => {
  const days = [
    day('2026-09-28', { studyMin: 60, digitalMin: 120, bedMin: bed(23, 50), sleepMin: 420 }),
    day('2026-09-29', { studyMin: 30, digitalMin: 100, bedMin: bed(23, 40), sleepMin: 400 }),
    day('2026-09-30', { studyMin: 0, digitalMin: 90, bedMin: bed(23, 30), sleepMin: 410 }),
    day('2026-10-05', { studyMin: 90, digitalMin: 60, bedMin: bed(23, 20), sleepMin: 440 }),
    day('2026-10-06', { studyMin: 80, digitalMin: 80, bedMin: bed(23, 30), sleepMin: 430 }),
    day('2026-10-07', { studyMin: 20 }),
  ];
  const cmp = { thisSeconds: 190 * 60, lastSeconds: 90 * 60 };

  it('件数が足りていれば差が出る。Digital は、両方の週にデータのある同じ曜日の組だけを足す', () => {
    const [study, digital, bedM, sleep] = weekComparison(days, cmp, TODAY) as [WeekMetric, WeekMetric, WeekMetric, WeekMetric];
    expect(study).toMatchObject({ ready: true, have: 2, diff: 100 * 60 });
    // 月・火の組：今週 60+80 = 140、先週 120+100 = 220
    expect(digital).toMatchObject({ ready: true, have: 2, thisValue: 140, lastValue: 220, diff: -80 });
    // 就寝：今週 (23:20, 23:30) の平均 23:25、先週 (23:50, 23:40, 23:30) の平均 23:40 → 15分早い
    expect(bedM.ready).toBe(true);
    expect(bedM.diff).toBeCloseTo(-15);
    expect(sleep.diff).toBeCloseTo(435 - 410);
  });

  it('今日の分（途中）は、Digital の比較に入れない', () => {
    const m = weekComparison([...days, day('2026-09-30', { digitalMin: 999 })], cmp, TODAY);
    expect(m.find((x) => x.key === 'digital')?.have).toBe(2);
  });

  it('片方の週にデータが少ないうちは、差を出さずに「あと何件」', () => {
    const few = [day('2026-09-28', { studyMin: 60, digitalMin: 120, bedMin: bed(23, 50) }), day('2026-10-05', { studyMin: 30, digitalMin: 100, bedMin: bed(23, 20) })];
    const metrics = weekComparison(few, cmp, TODAY);
    expect(metrics.every((m) => !m.ready && m.diff === null)).toBe(true);
    const s = weekLines(metrics);
    expect(s.lines).toEqual([]);
    expect(s.pending.map((p) => [p.key, p.remaining, p.unit])).toEqual([
      ['week-study', MIN.weekDays - 1, '日分'],
      ['week-digital', MIN.weekDays - 1, '日分'],
      ['week-bed', MIN.weekDays - 1, '日分'],
      ['week-sleep', MIN.weekDays, '日分'],
    ]);
    expect(weekHeadline(metrics)).toBeNull();
  });

  it('文は数字と過去の自分との比較だけで、責める言葉を使わない', () => {
    const metrics = weekComparison(days, cmp, TODAY);
    expect(weekHeadline(metrics)).toBe('今週は先週より Study +1時間40分、Digital −1時間20分');
    const text = weekLines(metrics).lines.map((l) => l.text).join('\n');
    expect(text).toContain('勉強は先週の同じ時点より +1時間40分（今週 3時間10分、先週 1時間30分）');
    expect(text).toContain('平均就寝は 23:25（先週より15分早い、先週 23:40）');
    expect(text).not.toMatch(/ダメ|悪|サボ|怠|不足/);
  });

  it('増えた・遅くなったときも、同じ書き方（評価の言葉なし）', () => {
    const worse = [
      day('2026-09-28', { studyMin: 60, digitalMin: 60, bedMin: bed(23, 0) }),
      day('2026-09-29', { studyMin: 60, digitalMin: 60, bedMin: bed(23, 0) }),
      day('2026-10-05', { studyMin: 10, digitalMin: 120, bedMin: bed(23, 40) }),
      day('2026-10-06', { studyMin: 10, digitalMin: 120, bedMin: bed(23, 40) }),
    ];
    const lines = weekLines(weekComparison(worse, { thisSeconds: 1200, lastSeconds: 7200 }, TODAY)).lines.map((l) => l.text);
    expect(lines[0]).toContain('−1時間40分');
    expect(lines[1]).toContain('+2時間');
    expect(lines[2]).toContain('40分遅め');
  });
});

describe('勉強：科目 × 時間帯', () => {
  it('区分の分け方', () => {
    expect(bandOf(19).label).toBe('19〜21時');
    expect(bandOf(20).label).toBe('19〜21時');
    expect(bandOf(21).label).toBe('21〜24時');
    expect(bandOf(0).label).toBe('0〜6時');
    expect(lengthOf(30).label).toBe('30〜45分');
    expect(lengthOf(44.9).label).toBe('30〜45分');
    expect(lengthOf(200).label).toBe('90分〜');
  });

  const math = [
    sess('数学', 19, 40, 5), sess('数学', 20, 40, 4), sess('数学', 19, 40, 5),
    sess('数学', 15, 40, 2), sess('数学', 15, 40, 3), sess('数学', 16, 40, 2),
  ];

  it('件数を満たした区分が2つ以上あれば、平均効率がいちばん高い時間帯を出す（傾向として）', () => {
    const s = efficiencyByBand(math);
    expect(s.pending).toEqual([]);
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0]!.text).toBe('数学は19〜21時の平均効率が最も高い傾向があります（平均 4.7、3件。いちばん低い14〜17時は 2.3）');
    expect(s.lines[0]).toMatchObject({ n: 6, unit: '件' });
    expect(s.lines[0]!.score).toBeGreaterThan(0);
  });

  it('件数が足りない科目は「あと何件」。合計が足りない場合と、区分が足りない場合', () => {
    const few = [sess('英語', 19, 30, 4), sess('英語', 19, 30, 5)];
    expect(efficiencyByBand(few).lines).toEqual([]);
    // 合計 6 件まであと 4 件。区分は上位2つで (3-2) + (3-0) = 4 件 → 4
    expect(efficiencyByBand(few).pending[0]).toMatchObject({ key: 'band-英語', remaining: 4, unit: '件' });

    const oneBand = Array.from({ length: 6 }, () => sess('国語', 19, 30, 4));
    // 合計は足りているが、区分が1つだけ。もう1つの区分に 3 件
    expect(efficiencyByBand(oneBand).pending[0]).toMatchObject({ remaining: 3 });
  });

  it('効率つきの勉強が1件もないとき、「効率を入れた勉強」が必要だと分かる', () => {
    const s = efficiencyByBand([]);
    expect(s.lines).toEqual([]);
    expect(s.pending[0]).toMatchObject({ remaining: MIN.subjectSessions });
    expect(s.pending[0]!.label).toContain('効率を入れた勉強');
  });

  it('差が小さいときは、結論を出さず「大きな差は見られません」', () => {
    const flat = [...Array.from({ length: 3 }, () => sess('数学', 19, 30, 4)), ...Array.from({ length: 3 }, () => sess('数学', 15, 30, 4))];
    const s = efficiencyByBand(flat);
    expect(s.lines[0]!.text).toContain('大きな差は見られません');
    expect(s.lines[0]!.score).toBe(0);
  });
});

describe('勉強：セッションの長さ', () => {
  it('英語は30〜45分のセッションで効率が高い、のように出す', () => {
    const rows = [
      sess('英語', 19, 35, 5), sess('英語', 19, 40, 4), sess('英語', 18, 32, 5),
      sess('英語', 19, 20, 3), sess('英語', 19, 25, 2), sess('英語', 19, 18, 3),
    ];
    const s = efficiencyByLength(rows);
    expect(s.lines[0]!.text).toBe('英語は30〜45分のセッションで効率が高い傾向があります（平均 4.7、3件。いちばん低い15〜30分は 2.7）');
  });
});

describe('睡眠と Digital', () => {
  const nights = (n: number, f: (i: number) => Partial<DayFacts>) => Array.from({ length: n }, (_, i) => day(addDays('2026-09-10', i), f(i)));

  it('組が10日に満たないうちは「あと何件」', () => {
    const s = digitalVsBed(nights(7, (i) => ({ digitalMin: 60 + i * 10, bedMin: bed(23, 30) })));
    expect(s.lines).toEqual([]);
    expect(s.pending[0]).toMatchObject({ key: 'digital-bed', have: 7, need: MIN.pairs, remaining: 3, unit: '日分' });
  });

  it('Digital が短い半分と長い半分で、平均就寝時刻の差を出す', () => {
    // Digital が増えるほど就寝が 2 分ずつ遅くなる
    const s = digitalVsBed(nights(12, (i) => ({ digitalMin: 60 + i * 10, bedMin: bed(23, 0) + i * 2 })));
    expect(s.pending).toEqual([]);
    expect(s.lines[0]!.text).toBe('Digital が短い日（〜1時間50分、平均就寝 23:05）は、長い日（2時間0分〜、23:17）より就寝が12分早い傾向があります（12日分）');
    expect(s.lines[0]!.n).toBe(12);
  });

  it('終わっていない日・片方の記録がない日は数えない', () => {
    const rows = nights(12, (i) => ({ digitalMin: 60 + i * 10, bedMin: bed(23, 0) + i * 2 }));
    rows[0] = day(rows[0]!.date, { digitalMin: null, bedMin: bed(23, 0) });
    rows[1] = day(rows[1]!.date, { digitalMin: 70, bedMin: null });
    rows[2] = { ...rows[2]!, complete: false };
    expect(digitalVsBed(rows).pending[0]!.have).toBe(9);
  });

  it('差がほとんどないときは、そう書く', () => {
    const s = digitalVsBed(nights(10, (i) => ({ digitalMin: 60 + i * 10, bedMin: bed(23, 30) })));
    expect(s.lines[0]!.text).toContain('ほとんど差はありません');
    expect(s.lines[0]!.score).toBe(0);
  });
});

describe('就寝と翌日の勉強', () => {
  // 10/1〜10/12 の夜。就寝が遅い夜ほど、翌日の勉強が短い
  const make = (n: number) => {
    const days: DayFacts[] = [];
    for (let i = 0; i <= n; i++) {
      days.push(day(addDays('2026-09-20', i), { bedMin: i < n ? bed(23, 0) + i * 5 : null, studyMin: i === 0 ? 0 : 120 - (i - 1) * 6, complete: true }));
    }
    return days;
  };

  it('組が10夜に満たないうちは「あと何件」', () => {
    const s = bedVsNextDay(make(6), []);
    expect(s.lines).toEqual([]);
    expect(s.pending[0]).toMatchObject({ key: 'bed-nextday', have: 6, remaining: 4, unit: '夜' });
  });

  it('早い夜と遅い夜の、翌日の勉強時間の差を出す。効率は件数が足りなければ「あと何件」', () => {
    const s = bedVsNextDay(make(12), []);
    expect(s.lines).toHaveLength(1);
    // 早い半分の就寝 i=0..5 → 翌日の勉強 120,114,108,102,96,90（平均105）。遅い半分 i=6..11 → 84,78,72,66,60,54（平均69）
    expect(s.lines[0]!.text).toBe('就寝が早い夜（〜23:25）の翌日と、遅い夜（23:30〜）の翌日を比べると、勉強時間は平均36分長い傾向があります（12夜分。1時間45分 と 1時間9分）');
    expect(s.pending[0]).toMatchObject({ key: 'bed-nextday-eff', remaining: MIN.nextDayEfficiency });
  });

  it('翌日の勉強に効率の記録が十分あれば、効率の比較も出す', () => {
    const days = make(12);
    const sessions: EffSession[] = [];
    for (const d of days.slice(1)) for (let k = 0; k < 2; k++) sessions.push(sess('数学', 19, 30, Number(d.date.slice(-2)) < 26 ? 5 : 3, d.date));
    const s = bedVsNextDay(days, sessions);
    expect(s.pending).toEqual([]);
    expect(s.lines.map((l) => l.key)).toEqual(['bed-nextday-study', 'bed-nextday-eff']);
    expect(s.lines[1]!.text).toContain('早い夜の翌日のほうが高い傾向があります');
  });

  it('終わっていない日の翌朝までの組は数えない', () => {
    const days = make(12);
    days[12] = { ...days[12]!, complete: false };
    expect(bedVsNextDay(days, []).lines[0]!.text).toContain('11夜分');
    days[11] = { ...days[11]!, complete: false };
    days[10] = { ...days[10]!, complete: false };
    expect(bedVsNextDay(days, []).pending[0]).toMatchObject({ key: 'bed-nextday', have: 9, remaining: 1 });
  });
});

describe('まとめ・Today に出す1件', () => {
  it('データがまったくなくても、すべての項目に「あと何件」が出て、1件も出さない', () => {
    const r = buildInsights({ days: [], sessions: [], studyCompare: { thisSeconds: 0, lastSeconds: 0 }, todayKey: TODAY });
    expect(r.top).toBeNull();
    expect(r.week.lines).toEqual([]);
    expect(r.week.headline).toBeNull();
    for (const s of [r.week, r.study.band, r.study.length, r.sleep.digitalBed, r.sleep.bedNextDay, r.motivation]) expect(s.pending.length).toBeGreaterThan(0);
    expect(r.nearest).not.toBeNull();
    expect(r.nearest!.remaining).toBeGreaterThan(0);
  });

  it('いちばん差が大きい（意味のある）1件を選ぶ', () => {
    const big = { key: 'a', text: 'A', n: 5, unit: '日', score: 0.8 };
    const small = { key: 'b', text: 'B', n: 5, unit: '日', score: 0.2 };
    const zero = { key: 'c', text: 'C', n: 5, unit: '日', score: 0 };
    expect(pickTop([{ lines: [small, zero], pending: [] }, { lines: [big], pending: [] }]).top).toBe(big);
    expect(pickTop([{ lines: [zero], pending: [] }]).top).toBeNull(); // 差がない結論は、Today には出さない
  });

  it('近い項目（あと何件が少ない）を返す', () => {
    const near = { key: 'n', label: 'N', have: 9, need: 10, remaining: 1, unit: '日分' };
    const far = { key: 'f', label: 'F', have: 2, need: 10, remaining: 8, unit: '日分' };
    expect(pickTop([{ lines: [], pending: [far, near] }]).nearest).toBe(near);
  });
});

describe('モチベ × 睡眠・Digital・曜日', () => {
  const START = '2026-09-01'; // 火曜
  const make = (n: number, f: (i: number) => Partial<DayFacts>) => Array.from({ length: n }, (_, i) => day(addDays(START, i), { complete: true, ...f(i) }));

  it('件数が少ないうちは、結論を出さず「あと何件」', () => {
    const s = motivationInsights(make(7, (i) => ({ motivation: 5, sleepMin: 400, digitalMin: 60 + i })));
    expect(s.lines).toEqual([]);
    expect(s.pending.map((p) => [p.key, p.have, p.remaining])).toEqual([
      ['motivation-sleep', 6, MIN.pairs - 6], // 最初の日は、前の夜の睡眠がない
      ['motivation-digital', 7, MIN.pairs - 7],
      ['motivation-weekday', 7, (MIN.weekdayRecords - 1) * 2],
    ]);
    expect(motivationInsights([]).pending).toHaveLength(3);
  });

  it('睡眠が長い日ほどモチベが高いデータでは、そう出る（傾向として、件数つき）', () => {
    // 前の夜の睡眠が 5〜8時間に散らばり、長いほどモチベが高い
    const days = make(21, (i) => ({ sleepMin: 300 + (i % 7) * 30, motivation: 3 + (((i + 6) % 7)) * 0.8, digitalMin: 100 }));
    const s = motivationInsights(days);
    const line = s.lines.find((l) => l.key === 'motivation-sleep')!;
    expect(line.text).toMatch(/前の夜の睡眠が長い日（.*）と、短い日（.*）を比べると、モチベの平均は長い日が \d+\.\d、短い日が \d+\.\d で、睡眠が長い日のほうが高い傾向があります（20日分）/);
    expect(line.n).toBe(20);
    expect(line.score).toBeGreaterThan(0);
    expect(line.text).not.toMatch(/ため|せいで|原因|だから/);
  });

  it('Digital が長い日ほどモチベが低いデータでは、そう出る', () => {
    const days = make(14, (i) => ({ digitalMin: 30 + i * 10, motivation: 9 - i * 0.4 }));
    const line = motivationInsights(days).lines.find((l) => l.key === 'motivation-digital')!;
    expect(line.text).toContain('Digital が短い日のほうが高い傾向があります（14日分）');
  });

  it('差が小さいときは「ほとんど差はありません」で、Today には出さない（score 0）', () => {
    const days = make(14, (i) => ({ digitalMin: 30 + i * 10, motivation: 6 }));
    const line = motivationInsights(days).lines.find((l) => l.key === 'motivation-digital')!;
    expect(line.text).toContain('ほとんど差はありません');
    expect(line.score).toBe(0);
  });

  it('曜日：件数を満たした曜日が2つ以上あれば、いちばん高い曜日と低めの曜日を出す', () => {
    // 火曜(i%7==0)は 9、水曜(i%7==1)は 3、ほかは記録なし。3週間ぶん
    const days = make(21, (i) => ({ motivation: i % 7 === 0 ? 9 : i % 7 === 1 ? 3 : null }));
    const line = motivationInsights(days).lines.find((l) => l.key === 'motivation-weekday')!;
    expect(line.text).toBe('曜日では、火曜日のモチベの平均が最も高く（9.0、3日）、水曜日が最も低め（3.0、3日）の傾向があります');
    expect(line.n).toBe(6);
  });

  it('モチベが未記録の日は数えない（欠けは欠けのまま）', () => {
    const days = make(14, (i) => ({ digitalMin: 30 + i * 10, motivation: i % 2 ? 5 : null }));
    expect(motivationInsights(days).pending.find((p) => p.key === 'motivation-digital')).toMatchObject({ have: 7 });
  });
});
