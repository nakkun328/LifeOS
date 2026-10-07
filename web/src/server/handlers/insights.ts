import { pairAppEvents, resolveNights, sessionMs } from '@/lib/aggregate';
import { digitalDay, makeReducible } from '@/lib/digital';
import { buildInsights, MIN, type DayFacts, type EffSession, type InsightsResult } from '@/lib/insights';
import { addDays, bedMinutes, dayKey, dayStart, jstParts } from '@/lib/jst';
import { durationMinutes } from '@/lib/sleepStats';
import { studyWeekCompare } from '@/lib/study';
import type { AppEventRow, SessionRow, SleepRow, SubjectRow, UsageRow } from '@/lib/types';
import type { Ctx } from '../context';
import { getAppSettings } from './settings';

/** 集計に使う期間。Digital は行が多いので6週間、勉強のセッションは少ないので90日 */
export const INSIGHT_DAYS = 42;
export const SESSION_DAYS = 90;
/** これより短いセッションは、押し間違いの可能性があるので、効率の集計に入れない */
export const MIN_SESSION_MIN = 5;

export type InsightsView = InsightsResult & {
  now: string;
  /** もとにしている件数（画面の下に小さく出す） */
  counts: { efficiencySessions: number; studyDays: number; digitalDays: number; nights: number };
  minimums: typeof MIN;
};

export async function buildInsightsView(ctx: Ctx): Promise<InsightsView> {
  const { db, now, config } = ctx;
  const reducible = makeReducible((await getAppSettings(ctx)).digital);
  const todayKey = dayKey(now, config.boundaryMin);
  const firstKey = addDays(todayKey, -(INSIGHT_DAYS - 1));
  const from = dayStart(firstKey, config.boundaryMin);
  const usageFrom = new Date(from.getTime() - 6 * 3600_000).toISOString();

  const [subjects, sessions, sleepRows, usage, appEvents] = await Promise.all([
    db.select<SubjectRow>('subjects'),
    db.select<SessionRow>('sessions', { gte: { started_at: new Date(now.getTime() - SESSION_DAYS * 86_400_000).toISOString() } }),
    db.select<SleepRow>('sleep', { gte: { sleep_at: new Date(from.getTime() - 86_400_000).toISOString() } }),
    db.select<UsageRow>('usage', { gte: { start: usageFrom } }),
    db.select<AppEventRow>('app_events', { gte: { at: usageFrom } }),
  ]);
  const iphone = pairAppEvents(appEvents);
  const nights = resolveNights(sleepRows, config.boundaryMin);

  const days: DayFacts[] = [];
  for (let k = firstKey; k <= todayKey; k = addDays(k, 1)) {
    const complete = k < todayKey;
    const start = dayStart(k, config.boundaryMin);
    const end = dayStart(addDays(k, 1), config.boundaryMin);
    const dd = complete ? digitalDay(usage, iphone, k, reducible, config.boundaryMin) : null;
    const night = nights.find((n) => n.night_date === k && Date.parse(n.sleep_at) <= now.getTime());
    const dur = night && night.wake_at && Date.parse(night.wake_at) <= now.getTime() ? durationMinutes(night) : null;
    days.push({
      date: k,
      studyMin: sessionMs(sessions, 'study', start, end, now) / 60_000,
      digitalMin: dd && dd.hasData ? dd.minutes : null,
      bedMin: night ? bedMinutes(new Date(night.sleep_at)) : null,
      sleepMin: dur !== null && dur > 0 ? dur : null,
      complete,
    });
  }

  const eff: EffSession[] = [];
  for (const s of sessions) {
    if (s.kind !== 'study' || s.ended_at === null || s.efficiency === null) continue;
    const minutes = (Date.parse(s.ended_at) - Date.parse(s.started_at)) / 60_000;
    if (minutes < MIN_SESSION_MIN) continue;
    const start = new Date(s.started_at);
    eff.push({
      subject: subjects.find((x) => x.id === s.subject_id)?.name ?? 'その他',
      date: dayKey(start, config.boundaryMin),
      startHour: jstParts(start).hh,
      minutes,
      efficiency: s.efficiency,
    });
  }

  const cmp = studyWeekCompare(sessions, now, config.boundaryMin);
  const result = buildInsights({ days, sessions: eff, studyCompare: cmp, todayKey });
  return {
    ...result,
    now: now.toISOString(),
    counts: {
      efficiencySessions: eff.length,
      studyDays: days.filter((d) => d.studyMin > 0).length,
      digitalDays: days.filter((d) => d.digitalMin !== null).length,
      nights: days.filter((d) => d.bedMin !== null).length,
    },
    minimums: MIN,
  };
}
