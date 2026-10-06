// iPhone ショートカットからの入力。どちらも「同じデータが何度届いても二重にならない」。
import { dayKey, parseInstant } from '@/lib/jst';
import type { SleepRow } from '@/lib/types';
import type { Ctx } from '../context';
import { asObject, badRequest } from '../errors';

const FUTURE_SLACK_MS = 5 * 60_000;
const MAX_SLEEP_MS = 16 * 3600_000;
const MAX_AGE_MS = 7 * 86_400_000;
const MAX_EVENTS = 200;

const pick = (o: Record<string, unknown>, ...keys: string[]): unknown => keys.map((k) => o[k]).find((v) => v !== undefined);

/**
 * 睡眠（自動）。同じ夜の自動データは1件に保つ：
 *  - 同じ (sleep_at) の再送 → 何も増えない
 *  - 同じ夜で値が違う（Apple Watch が推定を更新した）→ その行を更新する
 * ボタンの記録は消さない（集計で自動データが優先される）。
 */
export async function ingestSleep(ctx: Ctx, body: unknown): Promise<{ night_date: string; updated: boolean }> {
  const b = asObject(body);
  const sleepAt = parseInstant(pick(b, 'sleep_at', 'start', 'bedtime'));
  const wakeAt = parseInstant(pick(b, 'wake_at', 'end', 'wake'));
  if (!sleepAt || !wakeAt) throw badRequest('sleep_at と wake_at が必要です（ISO 8601 形式）');
  const span = wakeAt.getTime() - sleepAt.getTime();
  if (span <= 0 || span > MAX_SLEEP_MS) throw badRequest('就寝と起床の時刻が正しくありません');
  if (wakeAt.getTime() > ctx.now.getTime() + FUTURE_SLACK_MS) throw badRequest('未来の時刻は記録できません');

  const nightDate = dayKey(sleepAt, ctx.config.boundaryMin);
  const autos = await ctx.db.select<SleepRow>('sleep', { eq: { source: 'auto' } });
  const sameNight = autos.find((r) => dayKey(new Date(r.sleep_at), ctx.config.boundaryMin) === nightDate);

  const row = { sleep_at: sleepAt.toISOString(), wake_at: wakeAt.toISOString(), source: 'auto' as const };
  if (sameNight) {
    const unchanged =
      Date.parse(sameNight.sleep_at) === sleepAt.getTime() && sameNight.wake_at !== null && Date.parse(sameNight.wake_at) === wakeAt.getTime();
    if (!unchanged) await ctx.db.update('sleep', { id: sameNight.id }, row);
    return { night_date: nightDate, updated: !unchanged };
  }
  await ctx.db.upsert('sleep', [row], { onConflict: 'source,sleep_at' });
  return { night_date: nightDate, updated: false };
}

/** アプリを開いた・閉じた。(app, event, at) で重複を無視。アプリ名は小文字にそろえる */
export async function ingestApp(ctx: Ctx, body: unknown): Promise<{ accepted: number }> {
  const b = asObject(body);
  const list = Array.isArray(b.events) ? b.events : [b];
  if (list.length === 0 || list.length > MAX_EVENTS) throw badRequest(`events は 1〜${MAX_EVENTS} 件にしてください`);

  const rows = list.map((raw) => {
    const e = asObject(raw);
    const app = typeof e.app === 'string' ? e.app.trim().toLowerCase().slice(0, 40) : '';
    if (!app) throw badRequest('app が必要です');
    if (e.event !== 'open' && e.event !== 'close') throw badRequest('event は open か close にしてください');
    const at = parseInstant(e.at);
    if (!at) throw badRequest('at が必要です（ISO 8601 形式）');
    if (at.getTime() > ctx.now.getTime() + FUTURE_SLACK_MS) throw badRequest('未来の時刻は記録できません');
    if (ctx.now.getTime() - at.getTime() > MAX_AGE_MS) throw badRequest('古すぎる記録です（7日以内）');
    // 秒より細かい差で別の記録にならないよう、秒に丸める
    return { app, event: e.event, at: new Date(Math.floor(at.getTime() / 1000) * 1000).toISOString() };
  });
  await ctx.db.upsert('app_events', rows, { onConflict: 'app,event,at', ignoreDuplicates: true });
  return { accepted: rows.length };
}
