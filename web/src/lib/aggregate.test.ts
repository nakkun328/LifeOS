import { describe, expect, it } from 'vitest';
import {
  bedSummary,
  lastNightDate,
  nightWindow,
  pairAppEvents,
  resolveNights,
  sessionMs,
  usageIn,
} from './aggregate';
import { bedDiffMessage, dueMessage, formatDuration } from './messages';
import type { SessionRow, SleepRow, UsageRow } from './types';

const jst = (s: string) => new Date(`${s}+09:00`);
const iso = (s: string) => jst(s).toISOString();
const AFTER = 23 * 60 + 30;

describe('sessionMs', () => {
  const mk = (kind: SessionRow['kind'], a: string, b: string | null): SessionRow => ({
    id: a, kind, subject_id: null, started_at: iso(a), ended_at: b ? iso(b) : null,
    efficiency: null, progress: null, note: null,
  });
  it('区間と重なる分だけ数える（境目をまたぐセッション）', () => {
    const rows = [mk('study', '2026-10-06T05:00:00', '2026-10-06T07:00:00')];
    // 今日 = 10/6 06:00〜 → 1時間だけが今日
    const ms = sessionMs(rows, 'study', jst('2026-10-06T06:00:00'), jst('2026-10-07T06:00:00'), jst('2026-10-06T12:00:00'));
    expect(ms).toBe(3600_000);
  });
  it('進行中は now まで。種別が違うものは数えない', () => {
    const rows = [mk('study', '2026-10-06T10:00:00', null), mk('club', '2026-10-06T09:00:00', '2026-10-06T10:00:00')];
    const now = jst('2026-10-06T11:30:00');
    expect(sessionMs(rows, 'study', jst('2026-10-06T06:00:00'), jst('2026-10-07T06:00:00'), now)).toBe(90 * 60_000);
    expect(sessionMs(rows, 'club', jst('2026-10-06T06:00:00'), jst('2026-10-07T06:00:00'), now)).toBe(3600_000);
  });
});

describe('就寝', () => {
  const sleep = (id: string, at: string, source: SleepRow['source'] = 'button'): SleepRow => ({
    id, sleep_at: iso(at), wake_at: null, source,
  });

  it('夜ごとにまとめる。昼寝は除く', () => {
    const nights = resolveNights([sleep('a', '2026-10-06T14:00:00'), sleep('b', '2026-10-06T23:50:00')]);
    expect(nights).toHaveLength(1);
    expect(nights[0]!.sleep_at).toBe(iso('2026-10-06T23:50:00'));
    expect(nights[0]!.night_date).toBe('2026-10-06');
  });

  it('0時を過ぎた就寝は前日の夜として数える', () => {
    const nights = resolveNights([sleep('a', '2026-10-07T00:20:00')]);
    expect(nights[0]!.night_date).toBe('2026-10-06');
  });

  it('自動データがある夜は auto を優先する（button は消さない）', () => {
    const rows = [sleep('b', '2026-10-06T23:50:00', 'button'), sleep('a', '2026-10-07T00:10:00', 'auto')];
    const nights = resolveNights(rows);
    expect(nights).toHaveLength(1);
    expect(nights[0]!.source).toBe('auto');
    expect(nights[0]!.sleep_at).toBe(iso('2026-10-07T00:10:00'));
    expect(rows).toHaveLength(2);
  });

  it('前の夜との差：23:50 → 00:20 は30分遅い／逆なら早い', () => {
    const nights = resolveNights([sleep('a', '2026-10-05T23:50:00'), sleep('b', '2026-10-07T00:20:00')]);
    const s = bedSummary(nights, jst('2026-10-07T09:00:00'));
    expect(s.diffMinutes).toBe(30);
    const early = resolveNights([sleep('a', '2026-10-05T23:50:00'), sleep('b', '2026-10-06T23:23:00')]);
    expect(bedSummary(early, jst('2026-10-07T09:00:00')).diffMinutes).toBe(-27);
  });

  it('前の夜の記録がなければ差は null', () => {
    const nights = resolveNights([sleep('b', '2026-10-06T23:23:00')]);
    expect(bedSummary(nights, jst('2026-10-07T09:00:00')).diffMinutes).toBeNull();
  });

  it('平日（日〜木の夜）だけで平均する', () => {
    // 10/5(月) 23:00, 10/6(火) 00:00 相当→夜は10/5, 10/9(金) 02:00→夜は10/8(木)、10/10(土) 03:00→夜は10/9(金)
    const rows = [
      sleep('a', '2026-10-05T23:00:00'), // 月の夜
      sleep('b', '2026-10-06T23:40:00'), // 火の夜
      sleep('c', '2026-10-09T03:00:00'), // 木の夜（金曜の朝3時）
      sleep('d', '2026-10-10T03:00:00'), // 金の夜 = 平日扱いにしない
    ];
    const s = bedSummary(resolveNights(rows), jst('2026-10-10T12:00:00'));
    // 23:00(+0), 23:40(+40), 03:00(+240) の平均 = 93.33 分 → 23:00 基準
    const base = 23 * 60 - 720;
    expect(s.weekdayAvgMinutes).toBeCloseTo((base + (base + 40) + (base + 240)) / 3, 5);
  });
});

describe('Digital', () => {
  const usage = (start: string, seconds: number, category: string, device: UsageRow['device'] = 'mac'): UsageRow => ({
    device, start: iso(start), seconds, category,
  });

  it('lastNightDate：23:30 以降は今夜、それ以前は前の夜', () => {
    expect(lastNightDate(jst('2026-10-06T10:00:00'), AFTER)).toBe('2026-10-05');
    expect(lastNightDate(jst('2026-10-06T23:29:00'), AFTER)).toBe('2026-10-05');
    expect(lastNightDate(jst('2026-10-06T23:30:00'), AFTER)).toBe('2026-10-06');
    expect(lastNightDate(jst('2026-10-07T01:00:00'), AFTER)).toBe('2026-10-06');
    expect(lastNightDate(jst('2026-10-07T06:00:00'), AFTER)).toBe('2026-10-06');
    expect(lastNightDate(jst('2026-10-07T05:59:00'), AFTER)).toBe('2026-10-06');
  });

  it('夜の窓は 23:30〜翌06:00', () => {
    const w = nightWindow('2026-10-06', AFTER);
    expect(w.start.toISOString()).toBe(iso('2026-10-06T23:30:00'));
    expect(w.end.toISOString()).toBe(iso('2026-10-07T06:00:00'));
  });

  it('23:30 以降の分だけを数える。境目をまたぐ区間は重なる分だけ', () => {
    const w = nightWindow('2026-10-06', AFTER);
    const rows = [
      usage('2026-10-06T23:00:00', 60, 'youtube'), // 窓の外
      usage('2026-10-06T23:29:30', 60, 'youtube'), // 30秒だけ窓の中
      usage('2026-10-07T00:10:00', 600, 'x'),
      usage('2026-10-07T06:10:00', 600, 'x'), // 朝は対象外
    ];
    const t = usageIn(rows, 'mac', w.start, w.end);
    expect(t.byCategory).toEqual({ youtube: 1, x: 10 }); // 30秒→ 0.5分 は四捨五入で1
    expect(t.minutes).toBe(11); // 630秒 = 10.5分 → 四捨五入
  });

  it('音楽は「減らしたい時間」に含めない', () => {
    const w = nightWindow('2026-10-06', AFTER);
    const rows = [usage('2026-10-07T00:00:00', 1800, 'youtube_music'), usage('2026-10-07T00:40:00', 300, 'youtube')];
    const t = usageIn(rows, 'mac', w.start, w.end);
    expect(t.minutes).toBe(5);
    expect(t.musicMinutes).toBe(30);
    expect(t.byCategory).toEqual({ youtube: 5 });
  });

  it('Mac と iPhone は分けて集計する', () => {
    const w = nightWindow('2026-10-06', AFTER);
    const rows = [usage('2026-10-07T00:00:00', 600, 'x', 'mac'), usage('2026-10-07T00:00:00', 1200, 'tiktok', 'iphone')];
    expect(usageIn(rows, 'mac', w.start, w.end).minutes).toBe(10);
    expect(usageIn(rows, 'iphone', w.start, w.end).byCategory).toEqual({ tiktok: 20 });
  });
});

describe('pairAppEvents', () => {
  const ev = (app: string, event: 'open' | 'close', at: string) => ({ app, event, at: iso(at) });
  it('開く→閉じるを組にして利用区間にする', () => {
    const rows = pairAppEvents([
      ev('TikTok', 'open', '2026-10-07T00:00:00'),
      ev('TikTok', 'close', '2026-10-07T00:10:00'),
    ]);
    expect(rows).toEqual([{ device: 'iphone', start: iso('2026-10-07T00:00:00'), category: 'tiktok', seconds: 600 }]);
  });
  it('対にならないものと異常に長いものは捨てる', () => {
    expect(pairAppEvents([ev('x', 'close', '2026-10-07T00:10:00')])).toEqual([]);
    expect(pairAppEvents([ev('x', 'open', '2026-10-07T00:00:00')])).toEqual([]);
    expect(
      pairAppEvents([ev('x', 'open', '2026-10-07T00:00:00'), ev('x', 'close', '2026-10-07T12:00:00')]),
    ).toEqual([]);
  });
  it('順番が入れ替わって届いても同じ結果', () => {
    const a = pairAppEvents([ev('x', 'close', '2026-10-07T00:05:00'), ev('x', 'open', '2026-10-07T00:00:00')]);
    expect(a[0]!.seconds).toBe(300);
  });
  it('アプリ別に組にする', () => {
    const rows = pairAppEvents([
      ev('a', 'open', '2026-10-07T00:00:00'),
      ev('b', 'open', '2026-10-07T00:01:00'),
      ev('a', 'close', '2026-10-07T00:02:00'),
      ev('b', 'close', '2026-10-07T00:05:00'),
    ]);
    expect(rows.map((r) => [r.category, r.seconds])).toEqual([['a', 120], ['b', 240]]);
  });
});

describe('messages', () => {
  it('改善量で伝える', () => {
    expect(bedDiffMessage(-27)).toBe('昨日より27分早く寝ました');
    expect(bedDiffMessage(15)).toBe('昨日より15分遅めでした');
    expect(bedDiffMessage(0)).toBe('昨日と同じ時刻に寝ました');
    expect(bedDiffMessage(null)).toBeNull();
  });
  it('時間の整形と期限', () => {
    expect(formatDuration(5400)).toBe('1時間30分');
    expect(formatDuration(600)).toBe('10分');
    expect(dueMessage(3)).toBe('あと3日');
    expect(dueMessage(0)).toBe('今日が期限');
    expect(dueMessage(-2)).not.toMatch(/遅れ|失敗|ダメ/);
  });
});
