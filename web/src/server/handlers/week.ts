import {
  bedSummary,
  lastNightDate,
  nightWindow,
  pairAppEvents,
  resolveNights,
  sessionMs,
  usageIn,
} from '@/lib/aggregate';
import { addDays, dayKey, dayStart, formatClock, weekStartKey } from '@/lib/jst';
import { makeReducible } from '@/lib/digital';
import { formatAvgBed } from '@/lib/messages';
import type { AppEventRow, SessionRow, SleepRow, UsageRow } from '@/lib/types';
import type { Ctx } from '../context';
import { getAppSettings } from './settings';

export type WeekView = {
  weekStart: string;
  days: { date: string; studySeconds: number; clubSeconds: number }[];
  studySeconds: number;
  clubSeconds: number;
  nights: { night_date: string; bed: string; source: string }[];
  weekdayAvgBed: string | null;
  /** 夜ごとの「減らしたい時間」（23:30以降の分）。Mac と iPhone は別 */
  digital: { night_date: string; macMinutes: number; iphoneMinutes: number }[];
};

/** 今週（月曜 06:00 から今日まで）のまとめ */
export async function buildWeek(ctx: Ctx): Promise<WeekView> {
  const { db, now, config } = ctx;
  const reducible = makeReducible((await getAppSettings(ctx)).digital);
  const todayKey = dayKey(now, config.boundaryMin);
  const weekStartK = weekStartKey(todayKey);
  const weekStart = dayStart(weekStartK, config.boundaryMin);
  const windowStart = new Date(weekStart.getTime() - 86_400_000);

  const [sessions, sleepRows, usageRows, appEvents] = await Promise.all([
    db.select<SessionRow>('sessions', { gte: { started_at: windowStart.toISOString() } }),
    db.select<SleepRow>('sleep', { gte: { sleep_at: new Date(now.getTime() - 35 * 86_400_000).toISOString() } }),
    db.select<UsageRow>('usage', { gte: { start: new Date(weekStart.getTime() - 6 * 3600_000).toISOString() } }),
    db.select<AppEventRow>('app_events', { gte: { at: new Date(weekStart.getTime() - 6 * 3600_000).toISOString() } }),
  ]);
  const iphoneUsage = pairAppEvents(appEvents);

  const days: WeekView['days'] = [];
  for (let k = weekStartK; k <= todayKey; k = addDays(k, 1)) {
    const from = dayStart(k, config.boundaryMin);
    const to = dayStart(addDays(k, 1), config.boundaryMin);
    days.push({
      date: k,
      studySeconds: sessionMs(sessions, 'study', from, to, now) / 1000,
      clubSeconds: sessionMs(sessions, 'club', from, to, now) / 1000,
    });
  }

  const nights = resolveNights(sleepRows, config.boundaryMin);
  const bed = bedSummary(nights, now, config.boundaryMin);

  // 今週の夜（最新は進行中の夜も含む）
  const newest = lastNightDate(now, config.afterMin, config.boundaryMin);
  const digital: WeekView['digital'] = [];
  for (let k = weekStartK; k <= newest; k = addDays(k, 1)) {
    const w = nightWindow(k, config.afterMin, config.boundaryMin);
    digital.push({
      night_date: k,
      macMinutes: usageIn(usageRows, 'mac', w.start, w.end, reducible).minutes,
      iphoneMinutes: usageIn(iphoneUsage, 'iphone', w.start, w.end, reducible).minutes,
    });
  }

  return {
    weekStart: weekStartK,
    days,
    studySeconds: days.reduce((a, d) => a + d.studySeconds, 0),
    clubSeconds: days.reduce((a, d) => a + d.clubSeconds, 0),
    nights: nights
      .filter((n) => n.night_date >= weekStartK)
      .map((n) => ({ night_date: n.night_date, bed: formatClock(new Date(n.sleep_at)), source: n.source })),
    weekdayAvgBed: bed.weekdayAvgMinutes === null ? null : formatAvgBed(bed.weekdayAvgMinutes),
    digital,
  };
}
