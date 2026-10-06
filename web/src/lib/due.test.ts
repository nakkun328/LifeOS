import { describe, expect, it } from 'vitest';
import { parseDue } from './due';

const today = '2026-10-06';
describe('parseDue', () => {
  it.each([
    ['2026-10-09', '2026-10-09'],
    ['2026/10/9', '2026-10-09'],
    ['10/9', '2026-10-09'],
    ['10月9日', '2026-10-09'],
    ['１０／９', '2026-10-09'], // 全角も読める
    ['10/6', '2026-10-06'], // 今日
    ['今日', '2026-10-06'],
    ['明日', '2026-10-07'],
    ['明後日', '2026-10-08'],
    ['あさって', '2026-10-08'],
    ['3日後', '2026-10-09'],
  ] as const)('%s → %s', (input, expected) => expect(parseDue(input, today)).toBe(expected));

  it('過ぎた月日は来年にする。年末をまたぐ', () => {
    expect(parseDue('10/5', today)).toBe('2027-10-05');
    expect(parseDue('1/10', '2026-12-20')).toBe('2027-01-10');
    expect(parseDue('明日', '2026-12-31')).toBe('2027-01-01');
  });
  it('存在しない日付・解釈できない文字は null', () => {
    expect(parseDue('2026-02-30', today)).toBeNull();
    expect(parseDue('13/40', today)).toBeNull();
    expect(parseDue('そのうち', today)).toBeNull();
    expect(parseDue('', today)).toBeNull();
  });
});
