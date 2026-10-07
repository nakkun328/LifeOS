import { describe, expect, it } from 'vitest';
import { addDays } from '@/lib/jst';
import { buildInsightsView } from './handlers/insights';
import { buildToday } from './handlers/today';
import { iso, makeTestCtx } from './testing';

type Ctx = ReturnType<typeof makeTestCtx>;
const MATH = '00000000-0000-4000-8000-000000000001';

/** 9/20〜10/6 の17日ぶん。毎日 19時に数学40分（効率は日によって変わる）、就寝は少しずつ遅くなり、Digital は少しずつ増える */
function seed(ctx: Ctx) {
  const t = ctx.db.tables;
  t.subjects = [{ id: MATH, name: '数学', archived: false, created_at: iso('2026-09-01T00:00:00') }];
  t.sessions = [];
  t.sleep = [];
  t.usage = [];
  for (let i = 0; i < 17; i++) {
    const date = addDays('2026-09-20', i);
    const next = addDays(date, 1);
    t.sessions.push({ id: `s${i}`, kind: 'study', subject_id: MATH, started_at: iso(`${date}T${i % 2 ? '19' : '15'}:00:00`), ended_at: iso(`${date}T${i % 2 ? '19' : '15'}:40:00`), efficiency: i % 2 ? 5 : 2 });
    const bedMin = 23 * 60 + i * 2;
    const bed = `${bedMin >= 1440 ? next : date}T${String(Math.floor((bedMin % 1440) / 60)).padStart(2, '0')}:${String(bedMin % 60).padStart(2, '0')}:00`;
    t.sleep.push({ id: `b${i}`, sleep_at: iso(bed), wake_at: iso(`${next}T06:30:00`), source: 'button' });
    for (let m = 0; m < 60 + i * 5; m++) t.usage.push({ device: 'mac', start: iso(`${date}T${String(10 + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`), category: 'youtube', seconds: 60 });
  }
}

describe('Insights：集計の入口', () => {
  it('データが少ないうちは、結論を出さず、すべての項目に「あと何件」が出る', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    const v = await buildInsightsView(ctx);
    expect(v.top).toBeNull();
    expect(v.counts).toEqual({ efficiencySessions: 0, studyDays: 0, digitalDays: 0, nights: 0, motivationDays: 0 });
    for (const s of [v.week, v.study.band, v.study.length, v.sleep.digitalBed, v.sleep.bedNextDay, v.motivation]) {
      expect(s.lines).toEqual([]);
      expect(s.pending.length).toBeGreaterThan(0);
    }
    expect(v.nearest).toMatchObject({ unit: expect.any(String) });
  });

  it('データがたまると、傾向が出て、もとにした件数がつく', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    seed(ctx);
    const v = await buildInsightsView(ctx);
    expect(v.counts).toEqual({ efficiencySessions: 17, studyDays: 17, digitalDays: 17, nights: 17, motivationDays: 0 });

    // 勉強：19時台（効率5）が15時台（効率2）より高い
    expect(v.study.band.lines[0]!.text).toContain('数学は19〜21時の平均効率が最も高い傾向があります');
    expect(v.study.band.lines[0]!.n).toBe(17);
    // 睡眠と Digital：Digital が長い日ほど就寝が遅い
    expect(v.sleep.digitalBed.lines[0]!.text).toMatch(/Digital が短い日.*より就寝が\d+分早い傾向があります（17日分）/);
    // 今週と先週：10/5（月）・10/6（火）は、先週の 9/28・9/29 と比べられる
    expect(v.week.lines.map((l) => l.key)).toEqual(expect.arrayContaining(['week-study', 'week-digital', 'week-bed', 'week-sleep']));
    expect(v.week.headline).toMatch(/^今週は先週より Study .*Digital /);
    expect(v.top).not.toBeNull();
  });

  it('モチベの記録があれば、睡眠・Digital・曜日との関係が出る。未記録の日は数えない', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    seed(ctx);
    // 就寝が遅くなる（睡眠が短くなる）ほど、モチベが下がる。4日に1日は未記録
    ctx.db.tables.motivation_records = [];
    for (let i = 0; i < 17; i += 1) {
      if (i % 4 === 3) continue;
      ctx.db.tables.motivation_records.push({ id: `m${i}`, record_date: addDays('2026-09-20', i), scores: { phys: 9 - Math.floor(i / 4), photo: 9 - Math.floor(i / 4) - 1 }, comment: null });
    }
    const v = await buildInsightsView(ctx);
    expect(v.counts.motivationDays).toBe(13);
    expect(v.motivation.lines.map((l) => l.key)).toContain('motivation-digital');
    expect(v.motivation.lines.find((l) => l.key === 'motivation-digital')!.text).toContain('Digital が短い日のほうが高い傾向があります（13日分）');
    // 睡眠は「前の夜」と組にするので、記録のある日のうち、前の日に睡眠がある日だけ（初日を除く）
    expect(v.motivation.lines.find((l) => l.key === 'motivation-sleep')!.n).toBe(12);
  });

  it('短すぎるセッション（5分未満）は、効率の集計に入れない', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    seed(ctx);
    ctx.db.tables.sessions!.push({ id: 'x', kind: 'study', subject_id: MATH, started_at: iso('2026-10-06T21:00:00'), ended_at: iso('2026-10-06T21:03:00'), efficiency: 1 });
    expect((await buildInsightsView(ctx)).counts.efficiencySessions).toBe(17);
  });

  it('効率を入れていないセッションは、効率の集計に入れない（勉強時間には数える）', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    seed(ctx);
    for (const s of ctx.db.tables.sessions!.slice(0, 5)) s.efficiency = null;
    expect((await buildInsightsView(ctx)).counts).toMatchObject({ efficiencySessions: 12, studyDays: 17 });
  });

  it('Today の表示用の buildToday は、集計の重さを持ち込まない（Insights は別 API）', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    seed(ctx);
    expect('insights' in (await buildToday(ctx))).toBe(false);
  });
});
