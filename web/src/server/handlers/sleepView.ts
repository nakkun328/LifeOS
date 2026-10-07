import { resolveNights } from '@/lib/aggregate';
import { weekBedMessage, weekDurationMessage } from '@/lib/messages';
import { sleepSummary, type SleepSummary } from '@/lib/sleepStats';
import type { SleepRow } from '@/lib/types';
import type { Ctx } from '../context';
import { getAppSettings } from './settings';

export type SleepView = {
  now: string;
  targetBed: string;
  wakeTime: string;
  bedOpen: boolean;
  summary: SleepSummary;
  bedMessage: string | null;
  durationMessage: string | null;
};

export async function buildSleepView(ctx: Ctx): Promise<SleepView> {
  const { now, config } = ctx;
  const [settings, rows] = await Promise.all([
    getAppSettings(ctx),
    // 今週・先週・直近28日の平均のため、40日ぶんを取る
    ctx.db.select<SleepRow>('sleep', { gte: { sleep_at: new Date(now.getTime() - 40 * 86_400_000).toISOString() }, order: { col: 'sleep_at' } }),
  ]);
  const summary = sleepSummary(resolveNights(rows, config.boundaryMin), now, config.boundaryMin);
  return {
    now: now.toISOString(),
    targetBed: settings.sleep.targetBed,
    wakeTime: settings.sleep.wakeTime,
    bedOpen: rows.some((r) => r.source === 'button' && r.wake_at === null && Date.parse(r.sleep_at) > now.getTime() - 12 * 3600_000),
    summary,
    bedMessage: weekBedMessage(summary.bedDiffMin),
    durationMessage: weekDurationMessage(summary.durationDiffMin),
  };
}
