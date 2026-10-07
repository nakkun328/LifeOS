import {
  COMMENT_MAX,
  isMotivKey,
  isScore,
  mergeRecord,
  overlayScores,
  parseImport,
  sameRecord,
  validateScores,
  MOTIV_KEYS,
  type MotivKey,
  type MotivRecord,
  type Prefer,
} from '@/lib/motivation';
import { dayKey } from '@/lib/jst';
import type { MotivationRow } from '@/lib/types';
import type { Ctx } from '../context';
import { asObject, badRequest } from '../errors';

const TABLE = 'motivation_records';
export const MAX_IMPORT_CHARS = 2_000_000;

const toRecord = (r: MotivationRow): MotivRecord => ({ record_date: r.record_date, scores: r.scores ?? {}, comment: r.comment ?? null });
export const todayOf = (ctx: Ctx): string => dayKey(ctx.now, ctx.config.boundaryMin);

/** 全期間の記録（古い日が先）。グラフと履歴に使う */
export async function listMotivation(ctx: Ctx): Promise<{ today: string; records: MotivRecord[] }> {
  const rows = await ctx.db.select<MotivationRow>(TABLE, { order: { col: 'record_date', asc: true } });
  return { today: todayOf(ctx), records: rows.map(toRecord) };
}

export async function getMotivationOn(ctx: Ctx, date: string): Promise<MotivRecord | null> {
  const [row] = await ctx.db.select<MotivationRow>(TABLE, { eq: { record_date: date }, limit: 1 });
  return row ? toRecord(row) : null;
}

/** 日付と、保存したあとの記録を書き込む（その日が既にあれば更新）。日付は一意なので、並行しても1日1件に保たれる */
async function write(ctx: Ctx, rec: MotivRecord): Promise<MotivRecord> {
  await ctx.db.upsert(TABLE, [{ record_date: rec.record_date, scores: rec.scores, comment: rec.comment, updated_at: ctx.now.toISOString() }], { onConflict: 'record_date' });
  return rec;
}

const cleanComment = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw badRequest('メモが正しくありません');
  const t = v.replace(/\s*[\r\n]+\s*/g, ' ').trim();
  if (t.length > COMMENT_MAX) throw badRequest(`メモは ${COMMENT_MAX} 文字までにしてください`);
  return t === '' ? null : t;
};

/** 今日の記録を、送られた内容で上書きする（同じ日に記録し直すと上書き）。1項目以上の点数が必要。欠けた項目は、欠けのまま */
export async function saveMotivation(ctx: Ctx, body: unknown): Promise<MotivRecord> {
  const b = asObject(body);
  const v = validateScores(b.scores);
  if ('error' in v) throw badRequest(v.error);
  if (Object.keys(v.scores).length === 0) throw badRequest('点数を1つ以上入れてください');
  return write(ctx, { record_date: todayOf(ctx), scores: v.scores, comment: cleanComment(b.comment) });
}

/** 今日の記録のうち、1項目だけを更新する（ほかの項目とメモは残す）。Discord の /motiv 用 */
export async function setMotivationItem(ctx: Ctx, key: unknown, score: unknown): Promise<{ key: MotivKey; score: number; record: MotivRecord }> {
  if (!isMotivKey(key)) throw badRequest('項目が正しくありません');
  if (!isScore(score)) throw badRequest('点数は 1〜10 の整数にしてください');
  const date = todayOf(ctx);
  const cur = await getMotivationOn(ctx, date);
  const record = await write(ctx, { record_date: date, scores: overlayScores(cur?.scores ?? {}, { [key]: score }), comment: cur?.comment ?? null });
  return { key, score, record };
}

// ---- 取り込み ----

export type ImportReport = {
  dryRun: boolean;
  /** 読み取った行の数 */
  total: number;
  /** 取り込める日付の数（同じ日付はまとめた後） */
  validDates: number;
  period: { from: string; to: string } | null;
  invalidCount: number;
  /** 最初の20件だけ */
  invalid: Array<{ index: number; reason: string }>;
  /** 貼り付けの中で、同じ日付をまとめた数 */
  duplicateDates: number;
  /** Life OS に、まだない日付 */
  newDates: number;
  /** Life OS に、すでにある日付 */
  overlapDates: number;
  /** すでにある日付のうち、同じ項目が両方にあって値が違うものの数（日付×項目） */
  conflicts: number;
  /** 実際に書き込んだ数（dryRun のときは 0） */
  created: number;
  updated: number;
  unchanged: number;
};

/**
 * 旧アプリのデータを取り込む。同じ日付は項目ごとにマージする。
 * prefer：同じ項目が両方にあるときの選択（既定は existing＝Life OS の値を残す）。
 * 何度取り込んでも重複しない（日付で一意。同じ内容なら、書き込みも起きない）。
 */
export async function importMotivation(ctx: Ctx, body: unknown): Promise<ImportReport> {
  const b = asObject(body);
  if (typeof b.json !== 'string' || b.json.trim() === '') throw badRequest('取り込む JSON を貼り付けてください');
  if (b.json.length > MAX_IMPORT_CHARS) throw badRequest('データが大きすぎます');
  const prefer: Prefer = b.prefer === 'incoming' ? 'incoming' : 'existing';
  if (b.prefer !== undefined && b.prefer !== 'incoming' && b.prefer !== 'existing') throw badRequest('prefer は existing か incoming にしてください');
  const dryRun = b.dryRun === true;

  const parsed = parseImport(b.json);
  if ('error' in parsed) throw badRequest(parsed.error);

  const existingRows = await ctx.db.select<MotivationRow>(TABLE);
  const existing = new Map(existingRows.map((r) => [r.record_date, toRecord(r)]));

  let newDates = 0;
  let overlapDates = 0;
  let conflicts = 0;
  const toWrite: MotivRecord[] = [];
  let unchanged = 0;
  for (const rec of parsed.records) {
    const cur = existing.get(rec.record_date);
    if (!cur) {
      newDates += 1;
      toWrite.push(rec);
      continue;
    }
    overlapDates += 1;
    conflicts += MOTIV_KEYS.filter((k) => cur.scores[k] !== undefined && rec.scores[k] !== undefined && cur.scores[k] !== rec.scores[k]).length;
    const merged = mergeRecord(cur, rec, prefer);
    if (sameRecord(merged, cur)) unchanged += 1;
    else toWrite.push(merged);
  }

  let created = 0;
  let updated = 0;
  if (!dryRun) {
    const nowIso = ctx.now.toISOString();
    for (let i = 0; i < toWrite.length; i += 500) {
      await ctx.db.upsert(
        TABLE,
        toWrite.slice(i, i + 500).map((r) => ({ record_date: r.record_date, scores: r.scores, comment: r.comment, updated_at: nowIso })),
        { onConflict: 'record_date' },
      );
    }
    created = newDates;
    updated = toWrite.length - newDates;
  }

  const dates = parsed.records.map((r) => r.record_date);
  return {
    dryRun,
    total: parsed.total,
    validDates: parsed.records.length,
    period: dates.length ? { from: dates[0]!, to: dates[dates.length - 1]! } : null,
    invalidCount: parsed.invalid.length,
    invalid: parsed.invalid.slice(0, 20),
    duplicateDates: parsed.duplicateDates,
    newDates,
    overlapDates,
    conflicts,
    created,
    updated,
    unchanged,
  };
}
