import type { SessionKind, SessionRow, SubjectRow } from '@/lib/types';
import type { Ctx } from '../context';
import { asObject, badRequest, conflict, isUuid, notFound, optStr } from '../errors';

export const LONG_SESSION_MS = 3 * 3600_000;

export async function getActiveSession(ctx: Ctx): Promise<SessionRow | null> {
  const [row] = await ctx.db.select<SessionRow>('sessions', { eq: { ended_at: null }, limit: 1 });
  return row ?? null;
}

/** 勉強・部活の開始。同時に動かせるのは1つだけ */
export async function startSession(ctx: Ctx, body: unknown): Promise<SessionRow> {
  const b = asObject(body);
  const kind = b.kind === 'club' ? 'club' : b.kind === 'study' || b.kind === undefined ? 'study' : null;
  if (!kind) throw badRequest('kind は study か club にしてください');
  if (await getActiveSession(ctx)) throw conflict('すでに計測中です。先に終了してください');

  let subject_id: string | null = null;
  if (kind === 'study') {
    if (!isUuid(b.subject_id)) throw badRequest('科目を選んでください');
    const [subject] = await ctx.db.select<SubjectRow>('subjects', { eq: { id: b.subject_id }, limit: 1 });
    if (!subject || subject.archived) throw notFound('科目が見つかりません');
    subject_id = subject.id;
  }
  return ctx.db.insert<SessionRow>('sessions', {
    kind: kind satisfies SessionKind,
    subject_id,
    started_at: ctx.now.toISOString(),
    ended_at: null,
    efficiency: null,
    progress: null,
    note: null,
  });
}

function reviewPatch(b: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (b.efficiency !== undefined && b.efficiency !== null) {
    const e = Number(b.efficiency);
    if (!Number.isInteger(e) || e < 1 || e > 5) throw badRequest('効率は 1〜5 にしてください');
    patch.efficiency = e;
  }
  if (b.progress !== undefined) patch.progress = optStr(b.progress, '進捗', 500);
  if (b.note !== undefined) patch.note = optStr(b.note, 'メモ', 2000);
  return patch;
}

/** 終了。振り返り（効率・進捗・メモ）は任意で、同時に送ってもよい */
export async function stopSession(ctx: Ctx, body: unknown = {}): Promise<SessionRow> {
  const active = await getActiveSession(ctx);
  if (!active) throw conflict('計測中のセッションがありません');
  const patch = reviewPatch(asObject(body ?? {}));
  const [row] = await ctx.db.update<SessionRow>('sessions', { id: active.id }, {
    ...patch,
    ended_at: ctx.now.toISOString(),
  });
  return row!;
}

/** 終了後の振り返り入力（スキップしてもよい） */
export async function reviewSession(ctx: Ctx, id: string, body: unknown): Promise<SessionRow> {
  const patch = reviewPatch(asObject(body));
  const [row] = await ctx.db.update<SessionRow>('sessions', { id }, patch);
  if (!row) throw notFound('セッションが見つかりません');
  return row;
}

export const isLongRunning = (s: SessionRow, now: Date): boolean =>
  s.ended_at === null && now.getTime() - Date.parse(s.started_at) > LONG_SESSION_MS;
