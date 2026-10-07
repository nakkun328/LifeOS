import { bedMinutes, dayKey, dayOfWeek, addDays, weekStartKey, DAY_BOUNDARY_MIN, formatBedMinutes, formatClock } from './jst';
import type { Night } from './aggregate';

export const durationMinutes = (n: Night): number | null =>
  n.wake_at ? Math.round((Date.parse(n.wake_at) - Date.parse(n.sleep_at)) / 60_000) : null;

export type WeekSleep = {
  nights: number;
  /** 平均就寝（正午起点の分）。記録がなければ null */
  avgBedMinutes: number | null;
  /** 平均睡眠時間（分）。起床の記録がある夜だけで平均する */
  avgDurationMin: number | null;
};

const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** night_date が [fromKey, toKey) の夜の平均 */
export function weekSleep(nights: Night[], fromKey: string, toKey: string): WeekSleep {
  const inRange = nights.filter((n) => n.night_date >= fromKey && n.night_date < toKey);
  return {
    nights: inRange.length,
    avgBedMinutes: avg(inRange.map((n) => bedMinutes(new Date(n.sleep_at)))),
    avgDurationMin: avg(inRange.map(durationMinutes).filter((d): d is number => d !== null && d > 0)),
  };
}

export type SleepSummary = {
  last: { night_date: string; bed: string; wake: string | null; durationMin: number | null; source: string } | null;
  thisWeek: WeekSleep;
  lastWeek: WeekSleep;
  /** 今週の平均就寝 − 先週の平均就寝（分）。負なら早い。比べられなければ null */
  bedDiffMin: number | null;
  /** 今週の平均睡眠時間 − 先週（分）。正なら長い */
  durationDiffMin: number | null;
  /** 平日（日〜木の夜）の平均就寝。直近28日 */
  weekdayAvgBed: string | null;
  recent: Array<{ night_date: string; bed: string; wake: string | null; durationMin: number | null; source: string }>;
};

const view = (n: Night) => ({
  night_date: n.night_date,
  bed: formatClock(new Date(n.sleep_at)),
  wake: n.wake_at ? formatClock(new Date(n.wake_at)) : null,
  durationMin: durationMinutes(n),
  source: n.source,
});

export function sleepSummary(nights: Night[], now: Date, boundaryMin = DAY_BOUNDARY_MIN): SleepSummary {
  const upToNow = nights.filter((n) => Date.parse(n.sleep_at) <= now.getTime());
  const today = dayKey(now, boundaryMin);
  const weekStart = weekStartKey(today);
  const thisWeek = weekSleep(upToNow, weekStart, addDays(weekStart, 7));
  const lastWeek = weekSleep(upToNow, addDays(weekStart, -7), weekStart);

  const since = addDays(today, -28);
  const weekday = upToNow.filter((n) => n.night_date >= since && dayOfWeek(n.night_date) <= 4);
  const wdAvg = avg(weekday.map((n) => bedMinutes(new Date(n.sleep_at))));

  const last = upToNow.at(-1);
  return {
    last: last ? view(last) : null,
    thisWeek,
    lastWeek,
    bedDiffMin: thisWeek.avgBedMinutes !== null && lastWeek.avgBedMinutes !== null ? thisWeek.avgBedMinutes - lastWeek.avgBedMinutes : null,
    durationDiffMin:
      thisWeek.avgDurationMin !== null && lastWeek.avgDurationMin !== null ? thisWeek.avgDurationMin - lastWeek.avgDurationMin : null,
    weekdayAvgBed: wdAvg === null ? null : formatBedMinutes(wdAvg),
    recent: upToNow.slice(-14).reverse().map(view),
  };
}
