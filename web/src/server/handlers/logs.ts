import { addDays, dayKey } from '@/lib/jst';
import type { LogKind, LogRow, LogTag } from '@/lib/types';
import type { Ctx } from '../context';
import { asObject, badRequest } from '../errors';

export const LOG_TAGS: LogTag[] = ['趣味', '部活', '日記'];

const oneLine = (s: string) => s.replace(/\s*[\r\n]+\s*/g, ' ').trim();
const kindOf = (l: LogRow): LogKind => l.kind ?? 'log';

/**
 * 一言ログ、または部活の決定事項を残す。どちらも同じ入力欄で、kind で切り替える。
 *  - log      ：1行 + タグ（200文字まで）
 *  - decision ：本文（500文字まで）+ 任意の件名（例：文化祭2027）。タグは「部活」に固定
 */
export async function addLog(ctx: Ctx, body: unknown): Promise<LogRow> {
  const b = asObject(body);
  const kind: LogKind = b.kind === 'decision' ? 'decision' : 'log';
  if (b.kind !== undefined && b.kind !== 'log' && b.kind !== 'decision') throw badRequest('種別は log か decision にしてください');
  if (typeof b.body !== 'string') throw badRequest('本文が必要です');
  const text = oneLine(b.body);
  const max = kind === 'decision' ? 500 : 200;
  if (text.length < 1 || text.length > max) throw badRequest(`本文は 1〜${max} 文字にしてください`);

  let tag = b.tag as LogTag;
  let title: string | null = null;
  if (kind === 'decision') {
    tag = '部活';
    if (b.title !== undefined && b.title !== null && b.title !== '') {
      if (typeof b.title !== 'string') throw badRequest('件名が正しくありません');
      title = oneLine(b.title);
      if (title.length > 60) throw badRequest('件名は 60 文字までにしてください');
      if (title === '') title = null;
    }
  } else if (!LOG_TAGS.includes(tag)) {
    throw badRequest('タグは 趣味 / 部活 / 日記 から選んでください');
  }
  return ctx.db.insert<LogRow>('logs', {
    body: text,
    tag,
    kind,
    title,
    log_date: dayKey(ctx.now, ctx.config.boundaryMin),
    created_at: ctx.now.toISOString(),
  });
}

/** 新しい日付が先。days 日ぶん（既定30日）。決定事項は含めない */
export async function listLogs(ctx: Ctx, days = 30): Promise<LogRow[]> {
  const today = dayKey(ctx.now, ctx.config.boundaryMin);
  const n = Math.min(Math.max(Math.floor(days) || 30, 1), 366);
  const rows = await ctx.db.select<LogRow>('logs', { gte: { log_date: addDays(today, -(n - 1)) } });
  return rows
    .filter((l) => kindOf(l) === 'log')
    .sort((a, b) => b.log_date.localeCompare(a.log_date) || b.created_at.localeCompare(a.created_at));
}

export async function listTodayLogs(ctx: Ctx): Promise<LogRow[]> {
  const today = dayKey(ctx.now, ctx.config.boundaryMin);
  const rows = await ctx.db.select<LogRow>('logs', { eq: { log_date: today } });
  return rows.filter((l) => kindOf(l) === 'log').sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** 決定事項の一覧（新しい順）。q があれば、件名・本文にキーワードを含むものだけ（大文字小文字・全角半角の違いは無視） */
export async function listDecisions(ctx: Ctx, q = '', limit = 200): Promise<LogRow[]> {
  const rows = await ctx.db.select<LogRow>('logs', { eq: { kind: 'decision' } });
  const norm = (s: string) => s.normalize('NFKC').toLowerCase();
  const words = norm(q).split(/\s+/).filter(Boolean);
  return rows
    .filter((l) => {
      const hay = norm(`${l.title ?? ''} ${l.body}`);
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, Math.min(Math.max(limit, 1), 500));
}
