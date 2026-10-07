import { describe, expect, it } from 'vitest';
import type { Night } from './aggregate';
import { dayDiff, digitalDay, formatDelta } from './digital';
import { formatMinutes, weekBedMessage, weekDurationMessage } from './messages';
import { sleepSummary, weekSleep } from './sleepStats';
import { studyBySubject, studyTimeline, studyWeekCompare } from './study';
import type { SessionRow, SubjectRow, UsageRow } from './types';

const jst = (s: string) => new Date(`${s}+09:00`);
const iso = (s: string) => jst(s).toISOString();

describe('Study：科目別・タイムライン・先週比', () => {
  const subjects: SubjectRow[] = [
    { id: 'm', name: '数学', archived: false, created_at: '' },
    { id: 'e', name: '英語', archived: false, created_at: '' },
  ];
  const s = (id: string, kind: SessionRow['kind'], sub: string | null, a: string, b: string | null): SessionRow => ({
    id, kind, subject_id: sub, started_at: iso(a), ended_at: b ? iso(b) : null, efficiency: null, progress: null, note: null,
  });
  const from = jst('2026-10-07T06:00:00');
  const to = jst('2026-10-08T06:00:00');
  const now = jst('2026-10-07T20:00:00');

  it('科目別は多い順。部活は含めない。科目なしは「その他」', () => {
    const rows = [
      s('1', 'study', 'm', '2026-10-07T10:00:00', '2026-10-07T11:00:00'),
      s('2', 'study', 'e', '2026-10-07T12:00:00', '2026-10-07T13:45:00'),
      s('3', 'study', 'm', '2026-10-07T15:00:00', '2026-10-07T15:30:00'),
      s('4', 'club', null, '2026-10-07T16:00:00', '2026-10-07T18:00:00'),
      s('5', 'study', null, '2026-10-07T19:00:00', '2026-10-07T19:10:00'),
    ];
    expect(studyBySubject(rows, subjects, from, to, now)).toEqual([
      { subject_id: 'e', name: '英語', seconds: 6300 },
      { subject_id: 'm', name: '数学', seconds: 5400 },
      { subject_id: null, name: 'その他', seconds: 600 },
    ]);
  });

  it('タイムラインは開始が早い順。部活も区別して出す。窓の外は切り落とす。進行中は now まで', () => {
    const rows = [
      s('late', 'study', 'e', '2026-10-07T19:00:00', null),
      s('club', 'club', null, '2026-10-07T16:00:00', '2026-10-07T17:00:00'),
      s('night', 'study', 'm', '2026-10-07T05:00:00', '2026-10-07T07:00:00'), // 6:00 をまたぐ
    ];
    const t = studyTimeline(rows, subjects, from, to, now);
    expect(t.map((x) => [x.label, x.seconds, x.running])).toEqual([
      ['数学', 3600, false], // 6:00〜7:00 の1時間だけ
      ['部活', 3600, false],
      ['英語', 3600, true],
    ]);
    expect(t[0]!.start).toBe(iso('2026-10-07T06:00:00'));
  });

  it('先週比は「同じ時点まで」で比べる', () => {
    // 今週：月曜 10/5 06:00〜。いまは水曜 10/7 20:00
    const rows = [
      s('a', 'study', 'm', '2026-10-05T10:00:00', '2026-10-05T12:00:00'), // 今週 2h
      s('b', 'study', 'm', '2026-10-07T10:00:00', '2026-10-07T11:00:00'), // 今週 1h
      s('c', 'study', 'm', '2026-09-28T10:00:00', '2026-09-28T11:00:00'), // 先週(月) 1h
      s('d', 'study', 'm', '2026-09-30T10:00:00', '2026-09-30T11:00:00'), // 先週(水) 1h
      s('e', 'study', 'm', '2026-10-02T10:00:00', '2026-10-02T15:00:00'), // 先週(金) 5h → 同じ時点（水20時）より後なので含めない
    ];
    const c = studyWeekCompare(rows, now);
    expect(c.thisSeconds).toBe(3 * 3600);
    expect(c.lastSeconds).toBe(2 * 3600);
    expect(c.diffSeconds).toBe(3600);
  });
});

describe('Sleep：週平均と先週比', () => {
  const night = (night_date: string, bed: string, wake: string | null): Night => ({
    night_date, sleep_at: iso(bed), wake_at: wake ? iso(wake) : null, source: 'button',
  });
  const nights: Night[] = [
    night('2026-09-28', '2026-09-28T23:30:00', '2026-09-29T06:30:00'), // 先週（月）7h
    night('2026-09-29', '2026-09-29T23:50:00', '2026-09-30T06:20:00'), // 先週（火）6.5h
    night('2026-10-05', '2026-10-05T23:20:00', '2026-10-06T06:20:00'), // 今週（月）7h
    night('2026-10-06', '2026-10-07T00:10:00', '2026-10-07T06:10:00'), // 今週（火）6h
  ];
  const now = jst('2026-10-07T09:00:00');

  it('今週の平均と先週の平均、その差', () => {
    const s = sleepSummary(nights, now);
    expect(s.thisWeek.nights).toBe(2);
    expect(s.lastWeek.nights).toBe(2);
    // 今週 23:20 と 00:10 → 平均 23:45 / 先週 23:30 と 23:50 → 23:40
    expect(s.bedDiffMin).toBeCloseTo(5, 5);
    expect(s.thisWeek.avgDurationMin).toBeCloseTo(390, 5);
    expect(s.lastWeek.avgDurationMin).toBeCloseTo(405, 5);
    expect(s.durationDiffMin).toBeCloseTo(-15, 5);
  });

  it('最後の夜と、直近の一覧', () => {
    const s = sleepSummary(nights, now);
    expect(s.last).toMatchObject({ night_date: '2026-10-06', bed: '00:10', wake: '06:10', durationMin: 360 });
    expect(s.recent[0]!.night_date).toBe('2026-10-06'); // 新しい順
    expect(s.recent).toHaveLength(4);
  });

  it('平日（日〜木の夜）の平均就寝', () => {
    const s = sleepSummary(nights, now);
    expect(s.weekdayAvgBed).not.toBeNull();
  });

  it('先週の記録がなければ、差は null', () => {
    const s = sleepSummary(nights.slice(2), now);
    expect(s.bedDiffMin).toBeNull();
    expect(s.durationDiffMin).toBeNull();
  });

  it('起床の記録がない夜は、睡眠時間の平均に入れない', () => {
    const w = weekSleep([night('2026-10-05', '2026-10-05T23:00:00', null), night('2026-10-06', '2026-10-06T23:00:00', '2026-10-07T06:00:00')], '2026-10-05', '2026-10-12');
    expect(w.nights).toBe(2);
    expect(w.avgDurationMin).toBe(420);
  });

  it('責めない言い方で比べる', () => {
    expect(weekBedMessage(-12)).toBe('先週より12分早い平均就寝です');
    expect(weekBedMessage(25)).toBe('先週より25分遅めの平均就寝です');
    expect(weekBedMessage(null)).toBeNull();
    expect(weekDurationMessage(30)).toBe('先週より平均30分長く眠れています');
    expect(weekDurationMessage(-30)).toBe('先週より平均30分短めです');
    expect(formatMinutes(407)).toBe('6時間47分');
    expect(formatMinutes(45)).toBe('45分');
  });
});

describe('Digital：前日比・サービス別・設定による除外', () => {
  const u = (device: UsageRow['device'], start: string, seconds: number, category: string): UsageRow => ({
    device, start: iso(start), seconds, category,
  });
  const reducible = (c: string) => ['youtube', 'youtube_shorts', 'x', 'instagram', 'tiktok'].includes(c);

  const mac: UsageRow[] = [
    u('mac', '2026-10-06T10:00:00', 1800, 'youtube'), // 6日の日中 30分
    u('mac', '2026-10-06T23:40:00', 600, 'x'), // 6日の夜 10分
    u('mac', '2026-10-06T12:00:00', 3600, 'youtube_music'), // 音楽 60分（別枠）
    u('mac', '2026-10-05T10:00:00', 3600, 'youtube'), // 前日 60分
  ];
  const iphone: UsageRow[] = [u('iphone', '2026-10-06T22:00:00', 900, 'tiktok'), u('iphone', '2026-10-06T22:30:00', 600, 'line')];

  it('日の合計は Mac + iPhone。音楽と設定にないサービスは含めない。Mac と iPhone は分ける', () => {
    const d = digitalDay(mac, iphone, '2026-10-06', reducible);
    expect(d.mac.minutes).toBe(40);
    expect(d.iphone.minutes).toBe(15); // line は「減らしたい」に入っていない
    expect(d.minutes).toBe(55);
    expect(d.musicMinutes).toBe(60);
    expect(d.mac.byCategory).toEqual({ youtube: 30, x: 10 });
    expect(d.iphone.byCategory).toEqual({ tiktok: 15 });
  });

  it('前日比は、両方の日にデータがあるときだけ', () => {
    const day = digitalDay(mac, iphone, '2026-10-06', reducible);
    const prev = digitalDay(mac, iphone, '2026-10-05', reducible);
    expect(prev.minutes).toBe(60);
    expect(dayDiff(day, prev)).toBe(-5);
    const none = digitalDay(mac, iphone, '2026-10-04', reducible);
    expect(none.hasData).toBe(false);
    expect(dayDiff(prev, none)).toBeNull();
  });

  it('設定でサービスを足す／外すと、集計が変わる', () => {
    const withLine = digitalDay(mac, iphone, '2026-10-06', (c) => reducible(c) || c === 'line');
    expect(withLine.iphone.minutes).toBe(25);
    const noYoutube = digitalDay(mac, iphone, '2026-10-06', (c) => reducible(c) && c !== 'youtube');
    expect(noYoutube.mac.minutes).toBe(10);
  });

  it('音楽は、設定で「減らしたい」に入れても含めない', () => {
    const d = digitalDay(mac, iphone, '2026-10-06', () => true);
    expect(d.mac.byCategory.youtube_music).toBeUndefined();
    expect(d.musicMinutes).toBe(60);
  });

  it('増減は数字だけで出す', () => {
    expect(formatDelta(-32)).toBe('−32分');
    expect(formatDelta(12)).toBe('+12分');
    expect(formatDelta(0)).toBe('±0分');
  });
});
