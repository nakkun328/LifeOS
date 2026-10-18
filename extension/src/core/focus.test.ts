import { describe, expect, it } from 'vitest';
import { FOCUS_MINUTES, focusEnd, focusRemainingMs, isFocusing, nextFocusEnd } from './focus';

const T = 1_700_000_000_000;
const MIN = 60_000;

describe('集中タイマー', () => {
  it('50分後が終了時刻', () => {
    expect(FOCUS_MINUTES).toBe(50);
    expect(focusEnd(T)).toBe(T + 50 * MIN);
  });
  it('終了時刻の前だけ集中中（ちょうどの時刻は終了）', () => {
    const end = focusEnd(T);
    expect(isFocusing(end, end - 1)).toBe(true);
    expect(isFocusing(end, end)).toBe(false);
    expect(isFocusing(undefined, T)).toBe(false);
  });
  it('残り時間は 0 を下回らない', () => {
    const end = focusEnd(T);
    expect(focusRemainingMs(end, T + 20 * MIN)).toBe(30 * MIN);
    expect(focusRemainingMs(end, end + 5)).toBe(0);
    expect(focusRemainingMs(undefined, T)).toBe(0);
  });
  it('集中中に開始しても、終了時刻は変わらない（延長も短縮もない）', () => {
    const end = focusEnd(T);
    expect(nextFocusEnd(end, T + 10 * MIN)).toBe(end);
    expect(nextFocusEnd(end, end - 1)).toBe(end);
  });
  it('終わっていれば、新しい50分が始まる', () => {
    const end = focusEnd(T);
    expect(nextFocusEnd(end, end)).toBe(end + 50 * MIN);
    expect(nextFocusEnd(undefined, T)).toBe(T + 50 * MIN);
  });
});
