// 集中タイマー（50分）。開始したら、終わるまで取り消せない。
// 終了時刻（epoch ms）だけを保存し、残りは常に「現在時刻」から求める。

export const FOCUS_MINUTES = 50;

/** 開始時刻から終了時刻を求める */
export const focusEnd = (startMs: number): number => startMs + FOCUS_MINUTES * 60_000;

/** 集中中か（終了時刻より前） */
export const isFocusing = (endAt: number | undefined, nowMs: number): boolean => endAt !== undefined && endAt > nowMs;

/** 残りミリ秒（終了後・未開始は 0） */
export const focusRemainingMs = (endAt: number | undefined, nowMs: number): number =>
  endAt === undefined ? 0 : Math.max(0, endAt - nowMs);

/**
 * 新しい終了時刻。集中中は今の終了時刻のまま（延長も短縮もしない）。
 * 開始ボタンを何度押しても、最初の50分が変わらないようにする。
 */
export const nextFocusEnd = (current: number | undefined, nowMs: number): number =>
  isFocusing(current, nowMs) ? (current as number) : focusEnd(nowMs);
