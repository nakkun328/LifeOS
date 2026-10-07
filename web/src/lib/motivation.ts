// Motivation（旧「Motivation Monitor」）。項目・点数の付け方（1〜10）は旧アプリのまま。
// 項目の定義はこのファイル1か所（後から変えやすいように、他の場所に項目名・色を書かない）。
import { addDays } from './jst';

export type MotivGroup = 'dev' | 'hobby';

export const MOTIV_ITEMS = [
  { key: 'phys', label: '物理部関連', group: 'dev', color: '#5ab4f0' },
  { key: 'photo', label: '写真', group: 'dev', color: '#38d9c0' },
  { key: 'video', label: '動画編集', group: 'dev', color: '#7ecff5' },
  { key: 'baseball', label: '野球観戦', group: 'hobby', color: '#8b9fff' },
  { key: 'prospi', label: 'プロスピ', group: 'hobby', color: '#c07aff' },
  { key: 'game', label: 'その他ゲーム', group: 'hobby', color: '#ff8ab4' },
] as const satisfies ReadonlyArray<{ key: string; label: string; group: MotivGroup; color: string }>;

export type MotivKey = (typeof MOTIV_ITEMS)[number]['key'];
export const MOTIV_KEYS: MotivKey[] = MOTIV_ITEMS.map((i) => i.key);
export const MOTIV_GROUPS: Array<{ id: MotivGroup; label: string }> = [
  { id: 'dev', label: '開発' },
  { id: 'hobby', label: '趣味' },
];
export const MOTIV_MIN = 1;
export const MOTIV_MAX = 10;
export const MOTIV_DEFAULT = 5;
export const COMMENT_MAX = 500;

export type MotivScores = Partial<Record<MotivKey, number>>;
export type MotivRecord = { record_date: string; scores: MotivScores; comment: string | null };

export const isMotivKey = (k: unknown): k is MotivKey => typeof k === 'string' && (MOTIV_KEYS as string[]).includes(k);
export const labelOf = (k: MotivKey): string => MOTIV_ITEMS.find((i) => i.key === k)!.label;
export const isScore = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= MOTIV_MIN && v <= MOTIV_MAX;

export function isDateKey(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

/**
 * 点数のオブジェクトを検証する。未知のキー・1〜10 以外（小数・文字列を含む）は、すべて拒否する。
 * null は「欠け」として扱う（キーがないのと同じ）。
 */
export function validateScores(raw: unknown): { scores: MotivScores } | { error: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { error: 'scores がオブジェクトではありません' };
  const scores: MotivScores = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!isMotivKey(k)) return { error: `知らない項目です：${k}` };
    if (v === null || v === undefined) continue;
    if (!isScore(v)) return { error: `${k} の点数が 1〜10 の整数ではありません` };
    scores[k] = v;
  }
  return { scores };
}

/** 項目ごとに重ねる。over にある項目が、base を上書きする */
export const overlayScores = (base: MotivScores, over: MotivScores): MotivScores => ({ ...base, ...over });

export type Prefer = 'existing' | 'incoming';

/**
 * 同じ日付の記録を、項目ごとにマージする。同じ項目が両方にあるときは prefer の側を残す。
 * メモも同じ（片方だけにあればそれを残し、両方にあって違うときは prefer の側）。
 */
export function mergeRecord(existing: MotivRecord | undefined, incoming: MotivRecord, prefer: Prefer): MotivRecord {
  if (!existing) return incoming;
  const [a, b] = prefer === 'incoming' ? [existing, incoming] : [incoming, existing]; // b が優先
  return {
    record_date: incoming.record_date,
    scores: overlayScores(a.scores, b.scores),
    comment: b.comment ?? a.comment,
  };
}

export const sameRecord = (a: MotivRecord, b: MotivRecord): boolean =>
  a.comment === b.comment && MOTIV_KEYS.every((k) => a.scores[k] === b.scores[k]);

/** 記録のある項目の平均。1つもなければ null */
export function avgScore(scores: MotivScores): number | null {
  const xs = MOTIV_KEYS.map((k) => scores[k]).filter((v): v is number => typeof v === 'number');
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** 8マスのバー。例：7/10 → ■■■■■■□□ */
export function motivBar(score: number, cells = 8): string {
  const filled = Math.max(0, Math.min(cells, Math.round((score / MOTIV_MAX) * cells)));
  return '■'.repeat(filled) + '□'.repeat(cells - filled);
}

// ---- 取り込み ----

export type InvalidRow = { index: number; reason: string };
export type ParsedImport = {
  /** 日付ごとにまとめた、取り込める記録（日付順） */
  records: MotivRecord[];
  invalid: InvalidRow[];
  /** 読み取った行の数（不正な行を含む） */
  total: number;
  /** 同じ日付が貼り付けの中に複数あって、まとめた数 */
  duplicateDates: number;
};

/**
 * 旧アプリの形（{date, scores, comment} の配列）の JSON を読む。
 * 不正な行（日付の形式違い・未知のキー・1〜10 以外・点数もメモもない）は取り込まず、理由つきで返す。
 * 同じ日付が複数あるときは、あとの行が項目ごとに上書きしてまとめる。
 */
export function parseImport(text: string): ParsedImport | { error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { error: 'JSON として読めませんでした。コピーした内容をそのまま貼り付けてください。' };
  }
  const rows = Array.isArray(json) ? json : Array.isArray((json as { records?: unknown })?.records) ? (json as { records: unknown[] }).records : null;
  if (!rows) return { error: '配列（[ { "date": …, "scores": … }, … ]）の形ではありません。' };

  const invalid: InvalidRow[] = [];
  const byDate = new Map<string, MotivRecord>();
  let duplicateDates = 0;
  rows.forEach((row, index) => {
    const bad = (reason: string) => invalid.push({ index, reason });
    if (typeof row !== 'object' || row === null || Array.isArray(row)) return bad('オブジェクトではありません');
    const r = row as { date?: unknown; scores?: unknown; comment?: unknown };
    if (!isDateKey(r.date)) return bad('日付が YYYY-MM-DD の形式ではありません');
    const v = validateScores(r.scores ?? {});
    if ('error' in v) return bad(v.error);
    let comment: string | null = null;
    if (r.comment !== undefined && r.comment !== null) {
      if (typeof r.comment !== 'string') return bad('メモが文字列ではありません');
      comment = r.comment.trim() === '' ? null : r.comment.trim();
      if (comment !== null && comment.length > COMMENT_MAX) return bad(`メモが ${COMMENT_MAX} 文字を超えています`);
    }
    if (Object.keys(v.scores).length === 0 && comment === null) return bad('点数もメモもありません');
    const rec: MotivRecord = { record_date: r.date, scores: v.scores, comment };
    const prev = byDate.get(r.date);
    if (prev) duplicateDates += 1;
    byDate.set(r.date, prev ? mergeRecord(prev, rec, 'incoming') : rec);
  });
  const records = [...byDate.values()].sort((a, b) => a.record_date.localeCompare(b.record_date));
  return { records, invalid, total: rows.length, duplicateDates };
}

// ---- グラフ ----

export type ChartRange = 7 | 30 | 'all';
export type ItemSeries = { key: MotivKey; label: string; color: string; points: Array<number | null>; avg: number | null; n: number };
export type ChartData = { dates: string[]; items: ItemSeries[] };

/** 期間内の全日付（今日まで）。'all' は、最初の記録の日から。記録がなければ空 */
export function chartDates(records: MotivRecord[], range: ChartRange, todayKey: string): string[] {
  if (records.length === 0) return [];
  const first = range === 'all' ? [...records].map((r) => r.record_date).sort()[0]! : addDays(todayKey, -(range - 1));
  const out: string[] = [];
  for (let k = first; k <= todayKey; k = addDays(k, 1)) out.push(k);
  return out;
}

/** 項目ごとの折れ線の点（記録のない日は null＝線を切る）と、期間内の平均。欠けは欠けのまま扱い、0 や 5 で埋めない */
export function chartSeries(records: MotivRecord[], range: ChartRange, todayKey: string): ChartData {
  const dates = chartDates(records, range, todayKey);
  const byDate = new Map(records.map((r) => [r.record_date, r.scores]));
  const items = MOTIV_ITEMS.map((i) => {
    const points = dates.map((d) => byDate.get(d)?.[i.key] ?? null);
    const present = points.filter((p): p is number => p !== null);
    return { key: i.key, label: i.label, color: i.color, points, avg: present.length ? present.reduce((a, b) => a + b, 0) / present.length : null, n: present.length };
  });
  return { dates, items };
}
