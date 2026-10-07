import { sessionMs } from '@/lib/aggregate';
import { addDays, dayKey, dayStart, weekStartKey } from '@/lib/jst';
import { dayWindow, studyBySubject, studyTimeline, studyWeekCompare, type SubjectSeconds, type TimelineEntry, type WeekCompare } from '@/lib/study';
import type { SessionRow, SubjectRow } from '@/lib/types';
import type { Ctx } from '../context';
import { getActiveSession, isLongRunning } from './sessions';
import { listSubjects } from './subjects';

export type StudyView = {
  now: string;
  subjects: SubjectRow[];
  active: (SessionRow & { subject_name: string | null; long_running: boolean }) | null;
  today: { seconds: number; bySubject: SubjectSeconds[]; timeline: TimelineEntry[]; clubSeconds: number };
  week: { seconds: number; bySubject: SubjectSeconds[]; compare: WeekCompare; clubSeconds: number };
};

export async function buildStudy(ctx: Ctx): Promise<StudyView> {
  const { now, config } = ctx;
  const day = dayWindow(now, config.boundaryMin);
  const weekStart = dayStart(weekStartKey(day.key), config.boundaryMin);
  const lastWeekStart = new Date(weekStart.getTime() - 7 * 86_400_000);

  const [subjects, active, sessions] = await Promise.all([
    listSubjects(ctx),
    getActiveSession(ctx),
    // 先週の同じ時点との比較のため、先週の頭から（1日広めに）取る
    ctx.db.select<SessionRow>('sessions', { gte: { started_at: new Date(lastWeekStart.getTime() - 86_400_000).toISOString() } }),
  ]);
  const all = active && !sessions.some((s) => s.id === active.id) ? [...sessions, active] : sessions;
  const weekEnd = dayStart(addDays(day.key, 1), config.boundaryMin);

  return {
    now: now.toISOString(),
    subjects,
    active: active
      ? { ...active, subject_name: subjects.find((s) => s.id === active.subject_id)?.name ?? null, long_running: isLongRunning(active, now) }
      : null,
    today: {
      seconds: sessionMs(all, 'study', day.from, day.to, now) / 1000,
      bySubject: studyBySubject(all, subjects, day.from, day.to, now),
      timeline: studyTimeline(all, subjects, day.from, day.to, now),
      clubSeconds: sessionMs(all, 'club', day.from, day.to, now) / 1000,
    },
    week: {
      seconds: sessionMs(all, 'study', weekStart, weekEnd, now) / 1000,
      bySubject: studyBySubject(all, subjects, weekStart, weekEnd, now),
      compare: studyWeekCompare(all, now, config.boundaryMin),
      clubSeconds: sessionMs(all, 'club', weekStart, weekEnd, now) / 1000,
    },
  };
}
