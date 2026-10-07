// Motivation の通知（朝8時・夜21時、日本時間）。文面は責めない言い方にする。
// 送信は post 関数を差し込めるので、記録あり・なしの両方をテストできる。
import { addDays } from '@/lib/jst';
import { avgScore, MOTIV_GROUPS, MOTIV_ITEMS, motivBar, type MotivRecord } from '@/lib/motivation';
import type { Ctx } from './context';
import { HttpError } from './errors';
import { getMotivationOn, todayOf } from './handlers/motivation';

export type Post = (content: string) => Promise<void>;

const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const mdw = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))} ${DOW[new Date(`${date}T00:00:00Z`).getUTCDay()]}`;

const hasScores = (r: MotivRecord | null): r is MotivRecord => r !== null && Object.keys(r.scores).length > 0;

/** 昨日のまとめ。記録のある項目だけを出す（欠けは欠けのまま） */
export function morningMessage(date: string, record: MotivRecord | null): string {
  if (!hasScores(record)) {
    return `☀️ おはよう。昨日（${mdw(date)}）のモチベは、記録がなかったよ。\n今日の分は、気が向いたときに Life OS か /motiv で残せるよ。`;
  }
  const lines = [`☀️ おはよう。昨日（${mdw(date)}）のモチベ`];
  for (const g of MOTIV_GROUPS) {
    const items = MOTIV_ITEMS.filter((i) => i.group === g.id && record.scores[i.key] !== undefined);
    if (items.length === 0) continue;
    lines.push(`【${g.label}】`);
    for (const i of items) lines.push(`${i.label}　${record.scores[i.key]}/10　${motivBar(record.scores[i.key]!)}`);
  }
  const avg = avgScore(record.scores);
  if (avg !== null) lines.push(`平均 ${(Math.round(avg * 10) / 10).toFixed(1)}`);
  if (record.comment) lines.push(`💬 ${record.comment}`);
  return lines.join('\n');
}

export function eveningMessage(): string {
  return '🌙 今日のモチベ、まだ記録していないよ。\n1項目だけでも /motiv で残せるよ。今日はお休みでも大丈夫。';
}

/** 朝8時：昨日の記録のまとめ。記録がなければ、その旨を送る */
export async function runMorning(ctx: Ctx, post: Post): Promise<{ sent: true; date: string; recorded: boolean }> {
  const date = addDays(todayOf(ctx), -1);
  const record = await getMotivationOn(ctx, date);
  await post(morningMessage(date, record));
  return { sent: true, date, recorded: hasScores(record) };
}

/** 夜21時：今日まだ記録がなければ催促を送る。記録済みなら送らない */
export async function runEvening(ctx: Ctx, post: Post): Promise<{ sent: boolean; date: string }> {
  const date = todayOf(ctx);
  if (hasScores(await getMotivationOn(ctx, date))) return { sent: false, date };
  await post(eveningMessage());
  return { sent: true, date };
}

const WEBHOOK = /^https:\/\/(?:(?:canary|ptb)\.)?(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/;

/** DISCORD_WEBHOOK_URL に送る関数。Discord の Webhook の URL 以外には送らない */
export function webhookPoster(url: string | undefined, fetchImpl: typeof fetch = fetch): Post {
  if (!url) throw new HttpError(503, 'DISCORD_WEBHOOK_URL が設定されていません（SETUP.md を参照）');
  if (!WEBHOOK.test(url)) throw new HttpError(503, 'DISCORD_WEBHOOK_URL が Discord の Webhook の URL の形ではありません');
  return async (content) => {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    });
    if (!res.ok) throw new HttpError(502, `Discord への送信に失敗しました（${res.status}）`);
  };
}

