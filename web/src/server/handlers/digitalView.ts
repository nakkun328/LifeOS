import { lastNightDate, nightWindow, pairAppEvents, usageIn, type DigitalTotals } from '@/lib/aggregate';
import { dayDiff, digitalDay, makeReducible, type DayDigital } from '@/lib/digital';
import { addDays, dayKey, dayStart } from '@/lib/jst';
import type { AppEventRow, GuardEventRow, UsageRow } from '@/lib/types';
import type { Ctx } from '../context';
import { getAppSettings } from './settings';

export type DigitalView = {
  now: string;
  /** 昨日（朝6時〜今朝6時）。前日比つき */
  yesterday: DayDigital & { diffMinutes: number | null };
  /** 今日（途中） */
  today: DayDigital;
  /** 昨夜（23:30 以降）。成功指標 */
  night: { nightDate: string; mac: DigitalTotals; iphone: DigitalTotals; minutes: number; unlocks: number; blocked: number };
  reduce: string[];
  exclude: string[];
};

export async function buildDigitalView(ctx: Ctx): Promise<DigitalView> {
  const { now, config } = ctx;
  const settings = await getAppSettings(ctx);
  const reducible = makeReducible(settings.digital);
  const todayKey = dayKey(now, config.boundaryMin);
  const nightKey = lastNightDate(now, config.afterMin, config.boundaryMin);
  const win = nightWindow(nightKey, config.afterMin, config.boundaryMin);
  const from = new Date(Math.min(dayStart(addDays(todayKey, -2), config.boundaryMin).getTime(), win.start.getTime()) - 6 * 3600_000).toISOString();

  const [usageRows, appEvents, guardRows] = await Promise.all([
    ctx.db.select<UsageRow>('usage', { gte: { start: from } }),
    ctx.db.select<AppEventRow>('app_events', { gte: { at: from } }),
    ctx.db.select<GuardEventRow>('guard_events', { gte: { at: dayStart(nightKey, config.boundaryMin).toISOString() } }),
  ]);
  const iphoneRows = pairAppEvents(appEvents);
  const day = (k: string) => digitalDay(usageRows, iphoneRows, k, reducible, config.boundaryMin);
  const yesterday = day(addDays(todayKey, -1));
  const nightGuard = guardRows.filter((g) => dayKey(new Date(g.at), config.boundaryMin) === nightKey);
  const mac = usageIn(usageRows, 'mac', win.start, win.end, reducible);
  const iphone = usageIn(iphoneRows, 'iphone', win.start, win.end, reducible);

  return {
    now: now.toISOString(),
    yesterday: { ...yesterday, diffMinutes: dayDiff(yesterday, day(addDays(todayKey, -2))) },
    today: day(todayKey),
    night: {
      nightDate: nightKey,
      mac,
      iphone,
      minutes: mac.minutes + iphone.minutes,
      unlocks: nightGuard.filter((g) => g.kind === 'unlocked').length,
      blocked: nightGuard.filter((g) => g.kind === 'blocked').length,
    },
    reduce: settings.digital.reduce,
    exclude: settings.digital.exclude,
  };
}
