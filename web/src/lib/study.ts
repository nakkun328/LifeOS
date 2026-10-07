import { sessionMs } from './aggregate';
import { addDays, dayKey, dayStart, weekStartKey, DAY_BOUNDARY_MIN } from './jst';
import type { SessionRow, SubjectRow } from './types';

export type SubjectSeconds = { subject_id: string | null; name: string; seconds: number };

const MS = 1000;
const overlap = (aS: number, aE: number, bS: number, bE: number) => Math.max(0, Math.min(aE, bE) - Math.max(aS, bS));

/** 科目別の勉強時間（多い順）。科目のないセッションは「その他」にまとめる */
export function studyBySubject(sessions: SessionRow[], subjects: SubjectRow[], from: Date, to: Date, now: Date): SubjectSeconds[] {
  const totals = new Map<string | null, number>();
  for (const s of sessions) {
    if (s.kind !== 'study') continue;
    const start = Date.parse(s.started_at);
    const end = s.ended_at ? Date.parse(s.ended_at) : now.getTime();
    const ms = overlap(start, end, from.getTime(), to.getTime());
    if (ms > 0) totals.set(s.subject_id, (totals.get(s.subject_id) ?? 0) + ms);
  }
  return [...totals.entries()]
    .map(([id, ms]) => ({ subject_id: id, name: subjects.find((x) => x.id === id)?.name ?? 'その他', seconds: ms / MS }))
    .sort((a, b) => b.seconds - a.seconds);
}

export type TimelineEntry = {
  id: string;
  kind: SessionRow['kind'];
  label: string;
  /** 区間（[from, to) に収めた時刻） */
  start: string;
  end: string;
  seconds: number;
  running: boolean;
};

/** 今日、何時に何を勉強したか（開始が早い順）。部活も、勉強と区別して出す */
export function studyTimeline(sessions: SessionRow[], subjects: SubjectRow[], from: Date, to: Date, now: Date): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  for (const s of sessions) {
    const start = Date.parse(s.started_at);
    const running = !s.ended_at;
    const end = s.ended_at ? Date.parse(s.ended_at) : now.getTime();
    const a = Math.max(start, from.getTime());
    const b = Math.min(end, to.getTime());
    if (b <= a) continue;
    out.push({
      id: s.id,
      kind: s.kind,
      label: s.kind === 'club' ? '部活' : (subjects.find((x) => x.id === s.subject_id)?.name ?? '勉強'),
      start: new Date(a).toISOString(),
      end: new Date(b).toISOString(),
      seconds: (b - a) / MS,
      running,
    });
  }
  return out.sort((x, y) => x.start.localeCompare(y.start));
}

export type WeekCompare = { thisSeconds: number; lastSeconds: number; diffSeconds: number };

/**
 * 今週の合計と、先週の「同じ時点まで」の合計との差。
 * 週の途中で先週の1週間ぶんと比べると、いつも少なく見えてしまうため。
 */
export function studyWeekCompare(sessions: SessionRow[], now: Date, boundaryMin = DAY_BOUNDARY_MIN): WeekCompare {
  const weekStart = dayStart(weekStartKey(dayKey(now, boundaryMin), ), boundaryMin);
  const lastStart = new Date(weekStart.getTime() - 7 * 86_400_000);
  const lastNow = new Date(now.getTime() - 7 * 86_400_000);
  const thisSeconds = sessionMs(sessions, 'study', weekStart, now, now) / MS;
  const lastSeconds = sessionMs(sessions, 'study', lastStart, lastNow, now) / MS;
  return { thisSeconds, lastSeconds, diffSeconds: thisSeconds - lastSeconds };
}

/** 今日の窓 [今日の朝6時, 明日の朝6時) */
export function dayWindow(now: Date, boundaryMin = DAY_BOUNDARY_MIN): { from: Date; to: Date; key: string } {
  const key = dayKey(now, boundaryMin);
  return { from: dayStart(key, boundaryMin), to: dayStart(addDays(key, 1), boundaryMin), key };
}
