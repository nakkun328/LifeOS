import { describe, expect, it } from 'vitest';
import { isAttending, stepWait } from './wait';

describe('isAttending', () => {
  it('表示中でフォーカスがあるときだけ「見ている」', () => {
    expect(isAttending('visible', true)).toBe(true);
    expect(isAttending('visible', false)).toBe(false); // 別のウィンドウ・アプリが前面
    expect(isAttending('hidden', true)).toBe(false); // 別のタブ
    expect(isAttending('hidden', false)).toBe(false);
  });
});

describe('stepWait', () => {
  it('見ている間は1秒ずつ減り、0 の次で done', () => {
    let s = stepWait(2, true);
    expect(s).toEqual({ left: 1, state: 'counting' });
    s = stepWait(s.left, true);
    expect(s).toEqual({ left: 0, state: 'counting' });
    expect(stepWait(s.left, true)).toEqual({ left: 0, state: 'done' });
  });
  it('見ていない間は進まない。戻ったら続きから', () => {
    let s = stepWait(5, true); // 残り4
    for (let i = 0; i < 100; i++) s = stepWait(s.left, false);
    expect(s).toEqual({ left: 4, state: 'paused' });
    expect(stepWait(s.left, true)).toEqual({ left: 3, state: 'counting' });
  });
  it('見ていない間は、残りが0でも解除しない', () => {
    expect(stepWait(0, false)).toEqual({ left: 0, state: 'paused' });
  });
  it('待ち時間が0秒の設定なら、見ていればすぐ done', () => {
    expect(stepWait(0, true)).toEqual({ left: 0, state: 'done' });
  });
});
