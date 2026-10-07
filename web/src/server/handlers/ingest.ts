// 拡張からの一括送信。再送されても二重にならない：
//  - usage ：(device, start, category) で上書き
//  - guard ：クライアントが付けた id で重複を無視
//  - bed   ：同じ id は1件
// 1件の不正で全体を止めない（拡張のキューが詰まらないよう、不正な行は数えて捨てる）。
import { parseInstant } from '@/lib/jst';
import type { Ctx } from '../context';
import { asObject, badRequest, isUuid } from '../errors';
import { recordBed } from './sleep';

const SITES = new Set(['youtube', 'x', 'instagram', 'tiktok']);
const CATEGORIES = new Set(['youtube', 'youtube_shorts', 'youtube_music', 'x', 'instagram', 'tiktok']);
const MAX_ITEMS = 500;

export type IngestResult = { accepted: number; rejected: number };

export async function ingest(ctx: Ctx, body: unknown): Promise<IngestResult> {
  const items = asObject(body).items;
  if (!Array.isArray(items)) throw badRequest('items が必要です');
  if (items.length > MAX_ITEMS) throw badRequest(`一度に送れるのは ${MAX_ITEMS} 件までです`);

  const usage: Record<string, unknown>[] = [];
  const guard: Record<string, unknown>[] = [];
  const beds: Record<string, unknown>[] = [];
  let rejected = 0;

  for (const raw of items) {
    try {
      const it = asObject(raw);
      const at = parseInstant(it.at ?? it.start);
      if (!at) throw new Error('time');
      if (it.type === 'usage') {
        const seconds = Number(it.seconds);
        if (!CATEGORIES.has(String(it.category)) || !(seconds > 0) || seconds > 60) throw new Error('usage');
        usage.push({ device: 'mac', start: at.toISOString(), category: it.category, seconds: Math.round(seconds) });
      } else if (it.type === 'guard') {
        if (!isUuid(it.id) || !SITES.has(String(it.site))) throw new Error('guard');
        if (it.kind !== 'blocked' && it.kind !== 'unlocked') throw new Error('guard');
        const reason = typeof it.reason === 'string' ? it.reason.slice(0, 200) : null;
        guard.push({ id: it.id, at: at.toISOString(), kind: it.kind, site: it.site, reason });
      } else if (it.type === 'bed') {
        if (!isUuid(it.id)) throw new Error('bed');
        beds.push({ id: it.id, at: at.toISOString() });
      } else {
        throw new Error('type');
      }
    } catch {
      rejected += 1;
    }
  }

  await ctx.db.upsert('usage', usage, { onConflict: 'device,start,category' });
  await ctx.db.upsert('guard_events', guard, { onConflict: 'id', ignoreDuplicates: true });
  for (const b of beds) {
    try {
      await recordBed(ctx, b);
    } catch {
      rejected += 1;
    }
  }
  return { accepted: items.length - rejected, rejected };
}
