import { addDays, bedMinutes, dayKey, dayOfWeek, dayStart, DAY_BOUNDARY_MIN, jstParts } from './jst';
import type { AppEventRow, SessionKind, SessionRow, SleepRow, UsageRow } from './types';

const MIN = 60_000;
export const MUSIC_CATEGORY = 'youtube_music';

/** 「減らしたい時間」に含めるか。音楽は含めない */
export const isReducible = (category: string): boolean => category !== MUSIC_CATEGORY;

const overlapMs = (aS: number, aE: number, bS: number, bE: number): number =>
  Math.max(0, Math.min(aE, bE) - Math.max(aS, bS));

/** [from, to) と重なる分だけを数える。進行中のセッションは now まで */
export function sessionMs(rows: SessionRow[], kind: SessionKind, from: Date, to: Date, now: Date): number {
  let total = 0;
  for (const s of rows) {
    if (s.kind !== kind) continue;
    const start = Date.parse(s.started_at);
    const end = s.ended_at ? Date.parse(s.ended_at) : now.getTime();
    total += overlapMs(start, end, from.getTime(), to.getTime());
  }
  return total;
}

// ---- 就寝 ----

export type Night = { night_date: string; sleep_at: string; wake_at: string | null; source: SleepRow['source'] };

/** 夜の就寝として扱う時間帯（18:00〜翌06:00）。昼寝を除くため */
export function isNightTime(d: Date): boolean {
  const h = jstParts(d).hh;
  return h >= 18 || h < 6;
}

/**
 * 夜ごとに1件へまとめる。自動データ（auto）がある夜はそれを優先し、
 * ボタンの記録はDBに残したまま集計だけ auto を使う。
 */
export function resolveNights(rows: SleepRow[], boundaryMin = DAY_BOUNDARY_MIN): Night[] {
  const byNight = new Map<string, Night>();
  const sorted = [...rows].sort((a, b) => Date.parse(a.sleep_at) - Date.parse(b.sleep_at));
  for (const r of sorted) {
    const at = new Date(r.sleep_at);
    if (!isNightTime(at)) continue;
    const night_date = dayKey(at, boundaryMin);
    const current = byNight.get(night_date);
    const candidate: Night = { night_date, sleep_at: r.sleep_at, wake_at: r.wake_at, source: r.source };
    if (!current || (current.source === 'button' && r.source === 'auto')) byNight.set(night_date, candidate);
  }
  return [...byNight.values()].sort((a, b) => a.night_date.localeCompare(b.night_date));
}

export type BedSummary = {
  lastNight: Night | null;
  /** 前の夜との差（分）。負なら早く寝た */
  diffMinutes: number | null;
  /** 平日の夜（日〜木）の平均就寝（正午起点の分）。直近28日 */
  weekdayAvgMinutes: number | null;
};

export function bedSummary(nights: Night[], now: Date, boundaryMin = DAY_BOUNDARY_MIN): BedSummary {
  const upToNow = nights.filter((n) => Date.parse(n.sleep_at) <= now.getTime());
  const lastNight = upToNow.at(-1) ?? null;
  let diffMinutes: number | null = null;
  if (lastNight) {
    const prev = upToNow.find((n) => n.night_date === addDays(lastNight.night_date, -1));
    if (prev) diffMinutes = bedMinutes(new Date(lastNight.sleep_at)) - bedMinutes(new Date(prev.sleep_at));
  }
  const today = dayKey(now, boundaryMin);
  const since = addDays(today, -28);
  const weekday = upToNow.filter((n) => n.night_date >= since && dayOfWeek(n.night_date) <= 4);
  const weekdayAvgMinutes = weekday.length
    ? weekday.reduce((sum, n) => sum + bedMinutes(new Date(n.sleep_at)), 0) / weekday.length
    : null;
  return { lastNight, diffMinutes, weekdayAvgMinutes };
}

// ---- Digital ----

/** 「昨夜」の日付。afterMin（23:30）以降は進行中の今夜、それ以前は前の夜 */
export function lastNightDate(now: Date, afterMin: number, boundaryMin = DAY_BOUNDARY_MIN): string {
  const k = dayKey(now, boundaryMin);
  const sinceBoundary = ((now.getTime() - dayStart(k, boundaryMin).getTime()) / MIN) | 0;
  const afterOffset = (((afterMin - boundaryMin) % 1440) + 1440) % 1440;
  return sinceBoundary >= afterOffset ? k : addDays(k, -1);
}

/** 夜の窓：その日の afterMin（23:30）から翌朝の区切りまで */
export function nightWindow(k: string, afterMin: number, boundaryMin = DAY_BOUNDARY_MIN): { start: Date; end: Date } {
  const base = dayStart(k, boundaryMin);
  const afterOffset = (((afterMin - boundaryMin) % 1440) + 1440) % 1440;
  return { start: new Date(base.getTime() + afterOffset * MIN), end: dayStart(addDays(k, 1), boundaryMin) };
}

export type DigitalTotals = {
  /** 減らしたい時間の合計（分） */
  minutes: number;
  /** 音楽（分）。minutes には含めない */
  musicMinutes: number;
  /** カテゴリ別（分）。音楽以外 */
  byCategory: Record<string, number>;
};

export function usageIn(
  rows: UsageRow[],
  device: UsageRow['device'],
  from: Date,
  to: Date,
  reducible: (category: string) => boolean = isReducible,
): DigitalTotals {
  const bySeconds: Record<string, number> = {};
  for (const r of rows) {
    if (r.device !== device) continue;
    const start = Date.parse(r.start);
    const ms = overlapMs(start, start + r.seconds * 1000, from.getTime(), to.getTime());
    if (ms > 0) bySeconds[r.category] = (bySeconds[r.category] ?? 0) + ms / 1000;
  }
  const byCategory: Record<string, number> = {};
  let reducedSeconds = 0;
  for (const [c, s] of Object.entries(bySeconds)) {
    if (c === MUSIC_CATEGORY || !reducible(c)) continue; // 音楽は常に別枠
    byCategory[c] = Math.round(s / 60);
    reducedSeconds += s;
  }
  return {
    minutes: Math.round(reducedSeconds / 60),
    musicMinutes: Math.round((bySeconds[MUSIC_CATEGORY] ?? 0) / 60),
    byCategory,
  };
}

/** iPhone：アプリを開いた・閉じたの組から利用区間を作る。対にならないものは捨てる */
export function pairAppEvents(events: AppEventRow[], maxHours = 6): UsageRow[] {
  const sorted = [...events].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at) || (a.event === 'close' ? -1 : 1) - (b.event === 'close' ? -1 : 1),
  );
  const open = new Map<string, string>();
  const out: UsageRow[] = [];
  for (const e of sorted) {
    const app = e.app.toLowerCase();
    if (e.event === 'open') {
      open.set(app, e.at);
      continue;
    }
    const start = open.get(app);
    if (!start) continue;
    open.delete(app);
    const seconds = Math.round((Date.parse(e.at) - Date.parse(start)) / 1000);
    if (seconds > 0 && seconds <= maxHours * 3600) out.push({ device: 'iphone', start, category: app, seconds });
  }
  return out;
}
