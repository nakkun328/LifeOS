import { parseInstant } from '@/lib/jst';
import type { SleepRow } from '@/lib/types';
import type { Ctx } from '../context';
import { asObject, badRequest, conflict, isUuid } from '../errors';

const FUTURE_SLACK_MS = 5 * 60_000;

function resolveAt(v: unknown, ctx: Ctx): Date {
  if (v === undefined || v === null) return ctx.now;
  const at = parseInstant(v);
  if (!at) throw badRequest('時刻の形式が正しくありません（ISO 8601）');
  if (at.getTime() > ctx.now.getTime() + FUTURE_SLACK_MS) throw badRequest('未来の時刻は記録できません');
  return at;
}

async function openBed(ctx: Ctx): Promise<SleepRow | null> {
  const [row] = await ctx.db.select<SleepRow>('sleep', {
    eq: { wake_at: null, source: 'button' },
    order: { col: 'sleep_at', asc: false },
    limit: 1,
  });
  return row ?? null;
}

/** 「寝る」。押し直しても、起きるまでは1件のまま。同じ id の再送も二重にならない */
export async function recordBed(ctx: Ctx, body: unknown = {}): Promise<{ sleep: SleepRow; created: boolean }> {
  const b = asObject(body ?? {});
  const at = resolveAt(b.at, ctx);
  const open = await openBed(ctx);
  if (open && at.getTime() - Date.parse(open.sleep_at) < 12 * 3600_000 && at.getTime() >= Date.parse(open.sleep_at)) {
    return { sleep: open, created: false };
  }
  const row: Record<string, unknown> = { sleep_at: at.toISOString(), wake_at: null, source: 'button' };
  if (b.id !== undefined) {
    if (!isUuid(b.id)) throw badRequest('id が正しくありません');
    const [dup] = await ctx.db.select<SleepRow>('sleep', { eq: { id: b.id }, limit: 1 });
    if (dup) return { sleep: dup, created: false };
    row.id = b.id;
  }
  return { sleep: await ctx.db.insert<SleepRow>('sleep', row), created: true };
}

/** 「起きた」。就寝の記録がなければ 409（時刻を推測で作らない） */
export async function recordWake(ctx: Ctx, body: unknown = {}): Promise<SleepRow> {
  const at = resolveAt(asObject(body ?? {}).at, ctx);
  const open = await openBed(ctx);
  if (!open || Date.parse(open.sleep_at) > at.getTime()) {
    throw conflict('就寝の記録がありません。先に「寝る」を押してください');
  }
  const [row] = await ctx.db.update<SleepRow>('sleep', { id: open.id }, { wake_at: at.toISOString() });
  return row!;
}
