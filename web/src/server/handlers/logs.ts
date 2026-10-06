import { addDays, dayKey } from '@/lib/jst';
import type { LogRow, LogTag } from '@/lib/types';
import type { Ctx } from '../context';
import { asObject, badRequest } from '../errors';

export const LOG_TAGS: LogTag[] = ['趣味', '部活', '日記'];

/** 一言ログを残す。1行（改行は空白にする）。日付は朝6時区切り */
export async function addLog(ctx: Ctx, body: unknown): Promise<LogRow> {
  const b = asObject(body);
  if (!LOG_TAGS.includes(b.tag as LogTag)) throw badRequest('タグは 趣味 / 部活 / 日記 から選んでください');
  if (typeof b.body !== 'string') throw badRequest('本文が必要です');
  const text = b.body.replace(/\s*[\r\n]+\s*/g, ' ').trim();
  if (text.length < 1 || text.length > 200) throw badRequest('本文は 1〜200 文字にしてください');
  return ctx.db.insert<LogRow>('logs', {
    body: text,
    tag: b.tag,
    log_date: dayKey(ctx.now, ctx.config.boundaryMin),
    created_at: ctx.now.toISOString(),
  });
}

/** 新しい日付が先。days 日ぶん（既定30日） */
export async function listLogs(ctx: Ctx, days = 30): Promise<LogRow[]> {
  const today = dayKey(ctx.now, ctx.config.boundaryMin);
  const n = Math.min(Math.max(Math.floor(days) || 30, 1), 366);
  const rows = await ctx.db.select<LogRow>('logs', { gte: { log_date: addDays(today, -(n - 1)) } });
  return rows.sort((a, b) => b.log_date.localeCompare(a.log_date) || b.created_at.localeCompare(a.created_at));
}

export async function listTodayLogs(ctx: Ctx): Promise<LogRow[]> {
  const today = dayKey(ctx.now, ctx.config.boundaryMin);
  const rows = await ctx.db.select<LogRow>('logs', { eq: { log_date: today } });
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
