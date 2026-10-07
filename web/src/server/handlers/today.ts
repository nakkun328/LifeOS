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
import { dayDiff, digitalDay, makeReducible } from '@/lib/digital';
import { addDays, dayKey, dayStart, weekStartKey } from '@/lib/jst';
import { bedDiffMessage, formatAvgBed } from '@/lib/messages';
import { durationMinutes } from '@/lib/sleepStats';
import { studyBySubject, type SubjectSeconds } from '@/lib/study';
import { upcoming } from '@/lib/tasks';
import type { AppEventRow, GuardEventRow, LogRow, SessionRow, SleepRow, SubjectRow, UsageRow } from '@/lib/types';
import type { Ctx } from '../context';
import { listTodayLogs } from './logs';
import { getActiveSession, isLongRunning } from './sessions';
import { getAppSettings } from './settings';
import { listSubjects } from './subjects';
import { listTasks, type TaskView } from './tasks';

export type TodayView = {
  now: string;
  /** 起床予定時刻（Settings の値） */
  wakeTime: string;
  targetBed: string;
  subjects: SubjectRow[];
  active: (SessionRow & { subject_name: string | null; long_running: boolean }) | null;
  study: { todaySeconds: number; weekSeconds: number; bySubject: SubjectSeconds[] };
  club: { todaySeconds: number; weekSeconds: number };
  sleep: {
    bedOpen: boolean;
    lastNight: { night_date: string; sleep_at: string; wake_at: string | null; source: string; durationMin: number | null } | null;
    diffMinutes: number | null;
    diffMessage: string | null;
    weekdayAvgBed: string | null;
  };
  tasks: TaskView[];
  logsToday: LogRow[];
  digital: {
    /** 昨日（朝6時〜今朝6時）の、減らしたい時間の合計と前日比 */
    day: { date: string; minutes: number; musicMinutes: number; diffMinutes: number | null };
    /** 昨夜（23:30 以降）。成功指標 */
    night: { nightDate: string; mac: DigitalTotals; iphone: DigitalTotals; unlocks: number; blocked: number };
  };
};

const addDaysIso = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000).toISOString();

export async function buildToday(ctx: Ctx): Promise<TodayView> {
  const { db, now, config } = ctx;
  const settings = await getAppSettings(ctx);
  const reducible = makeReducible(settings.digital);

  const todayKey = dayKey(now, config.boundaryMin);
  const todayStart = dayStart(todayKey, config.boundaryMin);
  const tomorrowStart = dayStart(addDays(todayKey, 1), config.boundaryMin);
  const weekStart = dayStart(weekStartKey(todayKey), config.boundaryMin);

  const nightKey = lastNightDate(now, config.afterMin, config.boundaryMin);
  const win = nightWindow(nightKey, config.afterMin, config.boundaryMin);
  // 昨日・一昨日の1日ぶんと、昨夜の窓をすべて含む範囲（iPhone の区間は前の日から始まることがあるので6時間広げる）
  const usageFrom = addDaysIso(new Date(Math.min(dayStart(addDays(todayKey, -2), config.boundaryMin).getTime(), win.start.getTime()) - 6 * 3600_000), 0);

  const [subjects, active, sessions, sleepRows, tasks, logsToday, usageRows, appEvents, guardRows] = await Promise.all([
    listSubjects(ctx),
    getActiveSession(ctx),
    db.select<SessionRow>('sessions', { gte: { started_at: addDaysIso(weekStart, -1) } }),
    db.select<SleepRow>('sleep', { gte: { sleep_at: addDaysIso(now, -35) }, order: { col: 'sleep_at' } }),
    listTasks(ctx),
    listTodayLogs(ctx),
    db.select<UsageRow>('usage', { gte: { start: usageFrom } }),
    db.select<AppEventRow>('app_events', { gte: { at: usageFrom } }),
    db.select<GuardEventRow>('guard_events', { gte: { at: dayStart(nightKey, config.boundaryMin).toISOString() } }),
  ]);
  // 週の頭をまたいで始まったセッションも拾うため、1日ぶん広めに取って重なりで数える
  const running = active && !sessions.some((s) => s.id === active.id) ? [...sessions, active] : sessions;

  const nights = resolveNights(sleepRows, config.boundaryMin);
  const bed = bedSummary(nights, now, config.boundaryMin);
  const last = bed.lastNight;

  const iphoneRows = pairAppEvents(appEvents);
  const yesterday = digitalDay(usageRows, iphoneRows, addDays(todayKey, -1), reducible, config.boundaryMin);
  const dayBefore = digitalDay(usageRows, iphoneRows, addDays(todayKey, -2), reducible, config.boundaryMin);
  const nightGuard = guardRows.filter((g) => dayKey(new Date(g.at), config.boundaryMin) === nightKey);

  return {
    now: now.toISOString(),
    wakeTime: settings.sleep.wakeTime,
    targetBed: settings.sleep.targetBed,
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
      bySubject: studyBySubject(running, subjects, todayStart, tomorrowStart, now),
    },
    club: {
      todaySeconds: sessionMs(running, 'club', todayStart, tomorrowStart, now) / 1000,
      weekSeconds: sessionMs(running, 'club', weekStart, tomorrowStart, now) / 1000,
    },
    sleep: {
      bedOpen: sleepRows.some((r) => r.source === 'button' && r.wake_at === null && Date.parse(r.sleep_at) > now.getTime() - 12 * 3600_000),
      lastNight: last
        ? { ...last, durationMin: durationMinutes(last) }
        : null,
      diffMinutes: bed.diffMinutes,
      diffMessage: bedDiffMessage(bed.diffMinutes),
      weekdayAvgBed: bed.weekdayAvgMinutes === null ? null : formatAvgBed(bed.weekdayAvgMinutes),
    },
    tasks: upcoming(tasks, 3) as TaskView[],
    logsToday,
    digital: {
      day: {
        date: yesterday.date,
        minutes: yesterday.minutes,
        musicMinutes: yesterday.musicMinutes,
        diffMinutes: dayDiff(yesterday, dayBefore),
      },
      night: {
        nightDate: nightKey,
        mac: usageIn(usageRows, 'mac', win.start, win.end, reducible),
        iphone: usageIn(iphoneRows, 'iphone', win.start, win.end, reducible),
        unlocks: nightGuard.filter((g) => g.kind === 'unlocked').length,
        blocked: nightGuard.filter((g) => g.kind === 'blocked').length,
      },
    },
  };
}
