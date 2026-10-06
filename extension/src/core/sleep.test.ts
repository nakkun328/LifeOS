import { describe, expect, it } from 'vitest';
import { formatSleep, remainingSleepMs, splitDuration } from './sleep';

const at = (day: number, h: number, m: number, s = 0) => new Date(2026, 9, day, h, m, s);

describe('remainingSleepMs', () => {
  it('23:08 に寝れば 6時間52分', () => {
    expect(formatSleep(remainingSleepMs(at(6, 23, 8), '06:00'))).toBe('6時間52分');
  });
  it('日付をまたいだ後（00:30）', () => {
    expect(formatSleep(remainingSleepMs(at(7, 0, 30), '06:00'))).toBe('5時間30分');
  });
  it('起床時刻を過ぎていたら翌日の起床時刻まで', () => {
    expect(formatSleep(remainingSleepMs(at(7, 6, 30), '06:00'))).toBe('23時間30分');
  });
  it('1時間未満は分のみ', () => {
    expect(formatSleep(remainingSleepMs(at(7, 5, 18), '06:00'))).toBe('42分');
  });
  it('秒の変化を追える', () => {
    const ms = remainingSleepMs(at(6, 23, 8, 30), '06:00');
    expect(splitDuration(ms)).toEqual({ hours: 6, minutes: 51, seconds: 30 });
  });
});
