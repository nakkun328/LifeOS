import { pairAppEvents, resolveNights, sessionMs, type Night } from '@/lib/aggregate';
import { dayDiff, digitalDay, makeReducible } from '@/lib/digital';
import { composeJournal, SETTLE_HOUR_JST, type JournalInput } from '@/lib/journal';
import { addDays, bedMinutes, dayKey, dayStart, formatClock } from '@/lib/jst';
import { durationMinutes } from '@/lib/sleepStats';
import { studyBySubject } from '@/lib/study';
import type { MotivRecord } from '@/lib/motivation';
import type { AppEventRow, JournalRow, MotivationRow, LogRow, SessionRow, SleepRow, SubjectRow, TaskRow, UsageRow } from '@/lib/types';
import type { Ctx } from '../context';
import { asObject, badRequest } from '../errors';
import { getAppSettings } from './settings';
import { isValidDate } from './tasks';

export type JournalView = {
  date: string;
  body: string;
  /** 手で編集した日記（自動では上書きされない） */
  edited: boolean;
  /** 日がまだ終わっていない（開くたびに、その時点のデータで作り直す） */
  inProgress: boolean;
  /** 材料のデータがあるか。false で本文も空なら「この日はまだ記録がありません」 */
  hasData: boolean;
  prev: string;
  /** 翌日。未来の日付には進めない */
  next: string | null;
};

export type JournalListItem = { date: string; preview: string; edited: boolean };

const MAX_BODY = 5000;
const HOUR = 3600_000;

/** 日記の日付 key の「確定する時刻」。翌朝の区切りから、さらに数時間あとに確定する（朝の睡眠・Digital の取り込みを待つ） */
export function settleAt(key: string, boundaryMin: number): Date {
  const next = dayStart(addDays(key, 1), boundaryMin);
  // 区切りが 06:00 で SETTLE_HOUR_JST が 12 なら、翌日の 12:00 JST
  return new Date(next.getTime() + Math.max(0, SETTLE_HOUR_JST * 60 - boundaryMin) * 60_000);
}

type Data = {
  subjects: SubjectRow[];
  sessions: SessionRow[];
  tasks: TaskRow[];
  logs: LogRow[];
  nights: Night[];
  usage: UsageRow[];
  iphone: UsageRow[];
  motivation: MotivRecord[];
  reducible: (category: string) => boolean;
};

/** from〜to（含む）の日記に必要なデータを、まとめて1回で読む */
async function loadData(ctx: Ctx, fromKey: string, toKey: string): Promise<Data> {
  const { db, config } = ctx;
  const settings = await getAppSettings(ctx);
  // 前日との比較のために、1日前から読む。iPhone の区間は前の日から始まることがあるので6時間広げる
  const from = dayStart(addDays(fromKey, -1), config.boundaryMin);
  const to = dayStart(addDays(toKey, 1), config.boundaryMin);
  const usageFrom = new Date(from.getTime() - 6 * HOUR).toISOString();
  const [subjects, sessions, tasks, logs, sleepRows, usage, appEvents, motivRows] = await Promise.all([
    db.select<SubjectRow>('subjects'),
    db.select<SessionRow>('sessions', { gte: { started_at: new Date(from.getTime() - 24 * HOUR).toISOString() }, lt: { started_at: to.toISOString() } }),
    db.select<TaskRow>('tasks', { eq: { status: 'done' } }),
    db.select<LogRow>('logs', { gte: { log_date: fromKey }, lt: { log_date: addDays(toKey, 1) } }),
    db.select<SleepRow>('sleep', { gte: { sleep_at: new Date(from.getTime() - 24 * HOUR).toISOString() }, lt: { sleep_at: to.toISOString() } }),
    db.select<UsageRow>('usage', { gte: { start: usageFrom }, lt: { start: to.toISOString() } }),
    db.select<AppEventRow>('app_events', { gte: { at: usageFrom }, lt: { at: to.toISOString() } }),
    db.select<MotivationRow>('motivation_records', { gte: { record_date: fromKey }, lt: { record_date: addDays(toKey, 1) } }),
  ]);
  return {
    subjects,
    sessions,
    tasks,
    logs,
    nights: resolveNights(sleepRows, config.boundaryMin),
    usage,
    iphone: pairAppEvents(appEvents),
    motivation: motivRows.map((r) => ({ record_date: r.record_date, scores: r.scores ?? {}, comment: r.comment ?? null })),
    reducible: makeReducible(settings.digital),
  };
}

/** その日のデータを、日記の材料にする */
export function inputFor(ctx: Ctx, data: Data, key: string): JournalInput {
  const { now, config } = ctx;
  const from = dayStart(key, config.boundaryMin);
  const to = dayStart(addDays(key, 1), config.boundaryMin);
  const inProgress = now.getTime() < to.getTime();

  const study = studyBySubject(data.sessions, data.subjects, from, to, now).map((s) => ({ name: s.name, minutes: s.seconds / 60 }));
  const clubMinutes = sessionMs(data.sessions, 'club', from, to, now) / 60_000;
  const tasksDone = data.tasks
    .filter((t) => t.done_at !== null && Date.parse(t.done_at) >= from.getTime() && Date.parse(t.done_at) < to.getTime())
    .sort((a, b) => String(a.done_at).localeCompare(String(b.done_at)))
    .map((t) => t.title);

  const day = digitalDay(data.usage, data.iphone, key, data.reducible, config.boundaryMin);
  const prevDay = digitalDay(data.usage, data.iphone, addDays(key, -1), data.reducible, config.boundaryMin);
  const digital = day.hasData ? { minutes: day.minutes, diffMinutes: inProgress ? null : dayDiff(day, prevDay) } : null;

  // その夜（night_date = key）の就寝。まだ寝ていなければ出さない。前の夜があれば比べる
  const night = data.nights.find((n) => n.night_date === key && Date.parse(n.sleep_at) <= now.getTime());
  const prevNight = data.nights.find((n) => n.night_date === addDays(key, -1));
  const sleep = night
    ? {
        bed: formatClock(new Date(night.sleep_at)),
        bedDiffMinutes: prevNight ? bedMinutes(new Date(night.sleep_at)) - bedMinutes(new Date(prevNight.sleep_at)) : null,
        durationMin: night.wake_at && Date.parse(night.wake_at) <= now.getTime() ? durationMinutes(night) : null,
      }
    : null;

  const dayLogs = data.logs.filter((l) => l.log_date === key);
  const byTime = (a: LogRow, b: LogRow) => a.created_at.localeCompare(b.created_at);
  return {
    inProgress,
    study,
    clubMinutes,
    tasksDone,
    digital,
    sleep,
    motivation: data.motivation.find((m) => m.record_date === key) ?? null,
    logs: dayLogs.filter((l) => (l.kind ?? 'log') === 'log').sort(byTime).map((l) => ({ tag: l.tag, body: l.body })),
    decisions: dayLogs.filter((l) => l.kind === 'decision').sort(byTime).map((l) => ({ title: l.title ?? null, body: l.body })),
  };
}

const stored = (ctx: Ctx, key: string) => ctx.db.select<JournalRow>('journal_entries', { eq: { entry_date: key }, limit: 1 }).then((r) => r[0] ?? null);

/**
 * 日記の本文を決める。
 *  - 手で編集した日記は、そのまま返す（自動で上書きしない）
 *  - 日が終わって確定した（翌日の settleAt 以降に作られた）日記は、そのまま返す
 *  - それ以外は、その時点のデータで作り直す
 * 作った日記は保存する（一覧に出すため）。データがなく、保存済みもなければ、何も保存しない。
 */
async function resolve(ctx: Ctx, key: string, row: JournalRow | null, data: () => Data | Promise<Data>): Promise<{ body: string; edited: boolean; hasData: boolean }> {
  if (row?.edited) return { body: row.body, edited: true, hasData: row.body.trim() !== '' };
  const settled = settleAt(key, ctx.config.boundaryMin);
  if (row && row.generated_at && Date.parse(row.generated_at) >= settled.getTime()) {
    return { body: row.body, edited: false, hasData: row.body.trim() !== '' };
  }
  const out = composeJournal(inputFor(ctx, await data(), key));
  const nowIso = ctx.now.toISOString();
  if (row) {
    if (row.body !== out.body || row.generated_at === null || ctx.now >= settled) {
      await ctx.db.update('journal_entries', { id: row.id }, { body: out.body, generated_at: nowIso, updated_at: nowIso });
    }
  } else if (out.hasData) {
    await ctx.db.insert('journal_entries', { entry_date: key, body: out.body, edited: false, generated_at: nowIso, updated_at: nowIso });
  }
  return { body: out.body, edited: false, hasData: out.hasData };
}

function checkDate(ctx: Ctx, date: unknown): string {
  if (!isValidDate(date)) throw badRequest('日付は YYYY-MM-DD の形式で入れてください');
  if (date > dayKey(ctx.now, ctx.config.boundaryMin)) throw badRequest('これからの日の日記は作れません');
  return date;
}

function view(ctx: Ctx, key: string, r: { body: string; edited: boolean; hasData: boolean }): JournalView {
  const today = dayKey(ctx.now, ctx.config.boundaryMin);
  return {
    date: key,
    ...r,
    inProgress: key >= today,
    prev: addDays(key, -1),
    next: key < today ? addDays(key, 1) : null,
  };
}

export async function getJournal(ctx: Ctx, date?: string | null): Promise<JournalView> {
  const key = date ? checkDate(ctx, date) : dayKey(ctx.now, ctx.config.boundaryMin);
  const row = await stored(ctx, key);
  return view(ctx, key, await resolve(ctx, key, row, () => loadData(ctx, key, key)));
}

/** 手で書き直す。以後はこの日の日記を自動で上書きしない */
export async function saveJournal(ctx: Ctx, date: string, body: unknown): Promise<JournalView> {
  const key = checkDate(ctx, date);
  const b = asObject(body);
  if (typeof b.body !== 'string') throw badRequest('本文が必要です');
  const text = b.body.replace(/\r\n/g, '\n').trim();
  if (text.length > MAX_BODY) throw badRequest(`本文は ${MAX_BODY} 文字までにしてください`);
  const nowIso = ctx.now.toISOString();
  const row = await stored(ctx, key);
  if (row) await ctx.db.update('journal_entries', { id: row.id }, { body: text, edited: true, updated_at: nowIso });
  else await ctx.db.insert('journal_entries', { entry_date: key, body: text, edited: true, generated_at: null, updated_at: nowIso });
  return view(ctx, key, { body: text, edited: true, hasData: text !== '' });
}

/** 編集を取り消して、その日のデータから作り直す */
export async function resetJournal(ctx: Ctx, date: string): Promise<JournalView> {
  const key = checkDate(ctx, date);
  const row = await stored(ctx, key);
  const out = composeJournal(inputFor(ctx, await loadData(ctx, key, key), key));
  const nowIso = ctx.now.toISOString();
  if (row) await ctx.db.update('journal_entries', { id: row.id }, { body: out.body, edited: false, generated_at: nowIso, updated_at: nowIso });
  else if (out.hasData) await ctx.db.insert('journal_entries', { entry_date: key, body: out.body, edited: false, generated_at: nowIso, updated_at: nowIso });
  return view(ctx, key, { body: out.body, edited: false, hasData: out.hasData });
}

/** 日付ごとの一覧（新しい日が先）。直近 days 日のうち、日記のある日だけ */
export async function listJournal(ctx: Ctx, days = 14): Promise<JournalListItem[]> {
  const today = dayKey(ctx.now, ctx.config.boundaryMin);
  const n = Math.min(Math.max(Math.floor(days) || 14, 1), 31);
  const keys = Array.from({ length: n }, (_, i) => addDays(today, -i));
  const rows = await ctx.db.select<JournalRow>('journal_entries', { gte: { entry_date: keys[n - 1]! } });
  let data: Data | null = null;
  const load = async () => (data ??= await loadData(ctx, keys[n - 1]!, today));
  const out: JournalListItem[] = [];
  for (const key of keys) {
    const r = await resolve(ctx, key, rows.find((x) => x.entry_date === key) ?? null, load);
    if (r.body.trim() !== '') out.push({ date: key, preview: r.body.split('\n')[0]!, edited: r.edited });
  }
  return out;
}

