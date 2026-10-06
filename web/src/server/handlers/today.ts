import {
  bedSummary,
  lastNightDate,
  nightWindow,
  pairAppEvents,
  resolveNights,
  sessionMs,
  usageIn,
  type DigitalTotals,
} from '@/lib/aggregate';
import { addDays, dayKey, dayStart, weekStartKey } from '@/lib/jst';
import { bedDiffMessage, formatAvgBed } from '@/lib/messages';
import { upcoming } from '@/lib/tasks';
import type { AppEventRow, GuardEventRow, LogRow, SessionRow, SleepRow, SubjectRow, UsageRow } from '@/lib/types';
import type { Ctx } from '../context';
import { listTodayLogs } from './logs';
import { getActiveSession, isLongRunning } from './sessions';
import { listSubjects } from './subjects';
import { listTasks, type TaskView } from './tasks';

export type TodayView = {
  now: string;
  wakeTime: string;
  subjects: SubjectRow[];
  active: (SessionRow & { subject_name: string | null; long_running: boolean }) | null;
  study: { todaySeconds: number; weekSeconds: number };
  club: { todaySeconds: number; weekSeconds: number };
  sleep: {
    bedOpen: boolean;
    lastNight: { night_date: string; sleep_at: string; wake_at: string | null; source: string } | null;
    diffMinutes: number | null;
    diffMessage: string | null;
    weekdayAvgBed: string | null;
  };
  tasks: TaskView[];
  logsToday: LogRow[];
  digital: {
    nightDate: string;
    mac: DigitalTotals;
    iphone: DigitalTotals;
    unlocks: number;
    blocked: number;
  };
};

export async function buildToday(ctx: Ctx): Promise<TodayView> {
  const { db, now, config } = ctx;
  const todayKey = dayKey(now, config.boundaryMin);
  const weekStart = dayStart(weekStartKey(todayKey), config.boundaryMin);
  const todayStart = dayStart(todayKey, config.boundaryMin);
  const tomorrowStart = dayStart(addDays(todayKey, 1), config.boundaryMin);

  const [subjects, active, sessions, sleepRows, tasks, logsToday] = await Promise.all([
    listSubjects(ctx),
    getActiveSession(ctx),
    db.select<SessionRow>('sessions', { gte: { started_at: addDaysIso(weekStart, -1) } }),
    db.select<SleepRow>('sleep', { gte: { sleep_at: addDaysIso(now, -35) }, order: { col: 'sleep_at' } }),
    listTasks(ctx),
    listTodayLogs(ctx),
  ]);
  // 週の頭をまたいで始まったセッションも拾うため、1日ぶん広めに取って重なりで数える
  const running = active && !sessions.some((s) => s.id === active.id) ? [...sessions, active] : sessions;

  const nights = resolveNights(sleepRows, config.boundaryMin);
  const bed = bedSummary(nights, now, config.boundaryMin);

  const nightKey = lastNightDate(now, config.afterMin, config.boundaryMin);
  const win = nightWindow(nightKey, config.afterMin, config.boundaryMin);
  const from = addDaysIso(win.start, -0.25);
  const [usageRows, appEvents, guardRows] = await Promise.all([
    db.select<UsageRow>('usage', { gte: { start: from }, lt: { start: win.end.toISOString() } }),
    db.select<AppEventRow>('app_events', { gte: { at: from }, lt: { at: win.end.toISOString() } }),
    db.select<GuardEventRow>('guard_events', { gte: { at: dayStart(nightKey, config.boundaryMin).toISOString() } }),
  ]);
  const nightGuard = guardRows.filter((g) => dayKey(new Date(g.at), config.boundaryMin) === nightKey);

  return {
    now: now.toISOString(),
    wakeTime: config.wakeTime,
    subjects,
    active: active
      ? {
          ...active,
          subject_name: subjects.find((s) => s.id === active.subject_id)?.name ?? null,
          long_running: isLongRunning(active, now),
        }
      : null,
    study: {
      todaySeconds: sessionMs(running, 'study', todayStart, tomorrowStart, now) / 1000,
      weekSeconds: sessionMs(running, 'study', weekStart, tomorrowStart, now) / 1000,
    },
    club: {
      todaySeconds: sessionMs(running, 'club', todayStart, tomorrowStart, now) / 1000,
      weekSeconds: sessionMs(running, 'club', weekStart, tomorrowStart, now) / 1000,
    },
    sleep: {
      bedOpen: sleepRows.some((r) => r.source === 'button' && r.wake_at === null && Date.parse(r.sleep_at) > now.getTime() - 12 * 3600_000),
      lastNight: bed.lastNight,
      diffMinutes: bed.diffMinutes,
      diffMessage: bedDiffMessage(bed.diffMinutes),
      weekdayAvgBed: bed.weekdayAvgMinutes === null ? null : formatAvgBed(bed.weekdayAvgMinutes),
    },
    tasks: upcoming(tasks, 3) as TaskView[],
    logsToday,
    digital: {
      nightDate: nightKey,
      mac: usageIn(usageRows, 'mac', win.start, win.end),
      iphone: usageIn(pairAppEvents(appEvents), 'iphone', win.start, win.end),
      unlocks: nightGuard.filter((g) => g.kind === 'unlocked').length,
      blocked: nightGuard.filter((g) => g.kind === 'blocked').length,
    },
  };
}

function addDaysIso(d: Date, days: number): string {
  return new Date(d.getTime() + days * 86_400_000).toISOString();
}
