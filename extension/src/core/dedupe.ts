export const BLOCK_DEDUPE_MS = 60_000;

/** 同一タブ・同一サイトの blocked を一定時間内は1件にまとめる */
export function checkBlockDedupe(
  last: Record<string, number>,
  key: string,
  nowMs: number,
  windowMs: number = BLOCK_DEDUPE_MS,
): { record: boolean; next: Record<string, number> } {
  const next: Record<string, number> = {};
  for (const [k, t] of Object.entries(last)) {
    if (nowMs - t < windowMs) next[k] = t;
  }
  const prev = last[key];
  const record = prev === undefined || nowMs - prev >= windowMs;
  if (record) next[key] = nowMs;
  return { record, next };
}
