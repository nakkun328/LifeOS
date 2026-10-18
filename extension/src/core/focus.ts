// 集中タイマー（ポモドーロ）。開始したら、終わるまで取り消せない。
// 計画（開始時刻・集中/休憩の分・セット数）だけを保存し、今どの段階かは常に「現在時刻」から求める。

export const MODES = { '50-10': { focus: 50, rest: 10 }, '25-5': { focus: 25, rest: 5 } } as const;
export type FocusMode = keyof typeof MODES;
export const MAX_SETS = 8;

export type FocusPlan = { startMs: number; focusMin: number; restMin: number; sets: number };

export type FocusPhase =
  | { kind: 'focus'; set: number; sets: number; endMs: number }
  | { kind: 'rest'; set: number; sets: number; endMs: number }
  | { kind: 'done' };

const MIN = 60_000;

export const clampSets = (n: number): number => (Number.isFinite(n) ? Math.min(MAX_SETS, Math.max(1, Math.round(n))) : 1);

export const makePlan = (mode: FocusMode, sets: number, startMs: number): FocusPlan => ({
  startMs,
  focusMin: MODES[mode].focus,
  restMin: MODES[mode].rest,
  sets: clampSets(sets),
});

/** 全体の終了時刻（最後の集中が終わったとき。最後のあとに休憩はない） */
export const planEnd = (p: FocusPlan): number => p.startMs + (p.sets * p.focusMin + (p.sets - 1) * p.restMin) * MIN;

/** いまの段階。set は 1 始まり */
export function phaseAt(p: FocusPlan | undefined, nowMs: number): FocusPhase {
  if (!p || nowMs < p.startMs || nowMs >= planEnd(p)) return { kind: 'done' };
  const cycle = (p.focusMin + p.restMin) * MIN;
  const i = Math.floor((nowMs - p.startMs) / cycle);
  const t = p.startMs + i * cycle;
  const focusEnd = t + p.focusMin * MIN;
  if (nowMs < focusEnd) return { kind: 'focus', set: i + 1, sets: p.sets, endMs: focusEnd };
  return { kind: 'rest', set: i + 1, sets: p.sets, endMs: t + cycle };
}

/** 集中の段階か（サイトを止める） */
export const isFocusing = (p: FocusPlan | undefined, nowMs: number): boolean => phaseAt(p, nowMs).kind === 'focus';

/** 計画が進行中か（集中でも休憩でも） */
export const isActive = (p: FocusPlan | undefined, nowMs: number): boolean => phaseAt(p, nowMs).kind !== 'done';

/** 次に段階が変わる時刻。進行中でなければ undefined */
export function nextChange(p: FocusPlan | undefined, nowMs: number): number | undefined {
  const ph = phaseAt(p, nowMs);
  return ph.kind === 'done' ? undefined : ph.endMs;
}

/** 新しい計画。進行中は今の計画のまま（延長も短縮も、やり直しもない） */
export const nextPlan = (current: FocusPlan | undefined, mode: FocusMode, sets: number, nowMs: number): FocusPlan =>
  current && isActive(current, nowMs) ? current : makePlan(mode, sets, nowMs);
