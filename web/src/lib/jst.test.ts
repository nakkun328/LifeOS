import { describe, expect, it } from 'vitest';
import { addDays, bedMinutes, dayKey, dayStart, dayOfWeek, formatBedMinutes, parseInstant, weekStartKey } from './jst';

const jst = (s: string) => new Date(`${s}+09:00`);

describe('dayKey（朝6時で区切る）', () => {
  it.each([
    ['2026-10-06T05:59:00', '2026-10-05'],
    ['2026-10-06T06:00:00', '2026-10-06'],
    ['2026-10-06T23:59:00', '2026-10-06'],
    ['2026-10-07T00:30:00', '2026-10-06'], // 深夜は前日の夜
    ['2026-10-07T05:59:59', '2026-10-06'],
  ])('%s → %s', (t, k) => expect(dayKey(jst(t))).toBe(k));

  it('UTC の日付とずれても JST で判定する', () => {
    expect(dayKey(new Date('2026-10-06T20:30:00Z'))).toBe('2026-10-06'); // JST 10/7 05:30
    expect(dayKey(new Date('2026-10-06T21:00:00Z'))).toBe('2026-10-07'); // JST 10/7 06:00
  });
});

describe('日付ユーティリティ', () => {
  it('dayStart は JST の朝6時', () => {
    expect(dayStart('2026-10-06').toISOString()).toBe('2026-10-05T21:00:00.000Z');
  });
  it('addDays は月・年をまたぐ', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('曜日と週の開始（月曜）', () => {
    expect(dayOfWeek('2026-10-06')).toBe(2); // 火曜
    expect(weekStartKey('2026-10-06')).toBe('2026-10-05');
    expect(weekStartKey('2026-10-11')).toBe('2026-10-05'); // 日曜
    expect(weekStartKey('2026-10-05')).toBe('2026-10-05');
  });
});

describe('bedMinutes（0時をまたぐ比較）', () => {
  it('23:50 と 00:20 は30分差', () => {
    expect(bedMinutes(jst('2026-10-06T00:20:00')) - bedMinutes(jst('2026-10-05T23:50:00'))).toBe(30);
  });
  it('早い順に並ぶ', () => {
    expect(bedMinutes(jst('2026-10-06T22:00:00'))).toBeLessThan(bedMinutes(jst('2026-10-06T23:00:00')));
    expect(bedMinutes(jst('2026-10-06T23:30:00'))).toBeLessThan(bedMinutes(jst('2026-10-06T01:00:00')));
  });
  it('分から時刻へ戻せる', () => {
    expect(formatBedMinutes(bedMinutes(jst('2026-10-06T00:20:00')))).toBe('00:20');
    expect(formatBedMinutes(bedMinutes(jst('2026-10-06T23:50:00')))).toBe('23:50');
  });
});

describe('parseInstant', () => {
  it('TZ 付き ISO はそのまま', () => {
    expect(parseInstant('2026-10-06T14:00:00Z')?.toISOString()).toBe('2026-10-06T14:00:00.000Z');
    expect(parseInstant('2026-10-06T23:00:00+09:00')?.toISOString()).toBe('2026-10-06T14:00:00.000Z');
  });
  it('TZ なしは JST として扱う', () => {
    expect(parseInstant('2026-10-06 23:00:00')?.toISOString()).toBe('2026-10-06T14:00:00.000Z');
    expect(parseInstant('2026-10-06T23:00')?.toISOString()).toBe('2026-10-06T14:00:00.000Z');
  });
  it('不正な値は null', () => {
    expect(parseInstant('yesterday')).toBeNull();
    expect(parseInstant(123)).toBeNull();
    expect(parseInstant('')).toBeNull();
  });
});
