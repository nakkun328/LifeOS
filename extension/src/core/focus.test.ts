import { describe, expect, it } from 'vitest';
import { clampSets, isActive, isFocusing, makePlan, nextChange, nextPlan, phaseAt, planEnd } from './focus';

const T = 1_700_000_000_000;
const MIN = 60_000;

describe('集中タイマー（ポモドーロ）', () => {
  it('50-10 を3セット：50+10+50+10+50 = 170分で終わる（最後に休憩はない）', () => {
    const p = makePlan('50-10', 3, T);
    expect(planEnd(p)).toBe(T + 170 * MIN);
  });
  it('25-5 を4セット：25+5+25+5+25+5+25 = 115分', () => {
    expect(planEnd(makePlan('25-5', 4, T))).toBe(T + 115 * MIN);
  });
  it('段階：集中1 → 休憩1 → 集中2 → … → 終了', () => {
    const p = makePlan('25-5', 2, T);
    expect(phaseAt(p, T)).toEqual({ kind: 'focus', set: 1, sets: 2, endMs: T + 25 * MIN });
    expect(phaseAt(p, T + 25 * MIN - 1).kind).toBe('focus');
    expect(phaseAt(p, T + 25 * MIN)).toEqual({ kind: 'rest', set: 1, sets: 2, endMs: T + 30 * MIN });
    expect(phaseAt(p, T + 30 * MIN)).toEqual({ kind: 'focus', set: 2, sets: 2, endMs: T + 55 * MIN });
    expect(phaseAt(p, T + 55 * MIN).kind).toBe('done'); // 最後の集中の後に休憩はない
  });
  it('休憩中はサイトを止めない。集中中だけ止める', () => {
    const p = makePlan('50-10', 2, T);
    expect(isFocusing(p, T + 10 * MIN)).toBe(true);
    expect(isFocusing(p, T + 55 * MIN)).toBe(false);
    expect(isActive(p, T + 55 * MIN)).toBe(true);
    expect(isFocusing(p, T + 200 * MIN)).toBe(false);
    expect(isFocusing(undefined, T)).toBe(false);
  });
  it('次に変わる時刻', () => {
    const p = makePlan('25-5', 2, T);
    expect(nextChange(p, T + MIN)).toBe(T + 25 * MIN);
    expect(nextChange(p, T + 26 * MIN)).toBe(T + 30 * MIN);
    expect(nextChange(p, T + 999 * MIN)).toBeUndefined();
  });
  it('進行中に開始しても、今の計画のまま（延長も短縮もない）', () => {
    const p = makePlan('50-10', 3, T);
    expect(nextPlan(p, '25-5', 1, T + 10 * MIN)).toBe(p);
    expect(nextPlan(p, '25-5', 1, T + 55 * MIN)).toBe(p); // 休憩中でも
  });
  it('終わっていれば、新しい計画が始まる', () => {
    const p = makePlan('50-10', 1, T);
    const q = nextPlan(p, '25-5', 2, planEnd(p));
    expect(q).toEqual({ startMs: planEnd(p), focusMin: 25, restMin: 5, sets: 2 });
  });
  it('セット数は 1〜8 に丸める', () => {
    expect(clampSets(0)).toBe(1);
    expect(clampSets(99)).toBe(8);
    expect(clampSets(2.4)).toBe(2);
    expect(clampSets(NaN)).toBe(1);
  });
});
