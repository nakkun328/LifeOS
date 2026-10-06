import { describe, expect, it } from 'vitest';
import { countUnlocksTonight, nightKey, nightStart } from './night';
import { DEFAULT_SETTINGS, isEditLocked, mergeSettings, validateSettings } from './settings';
import { getNextTransition, getStage } from './stage';
import type { GuardEvent, Settings } from './types';

// 2026-10-06 は火曜。月は 0 始まり
const at = (day: number, h: number, m: number, s = 0) => new Date(2026, 9, day, h, m, s);
const S = DEFAULT_SETTINGS;

describe('getStage（初期値）', () => {
  it.each([
    [at(6, 12, 0), 'none'],
    [at(6, 22, 44, 59), 'none'],
    [at(6, 22, 45), 'prepare'],
    [at(6, 23, 14, 59), 'prepare'],
    [at(6, 23, 15), 'soft'],
    [at(6, 23, 29, 59), 'soft'],
    [at(6, 23, 30), 'hard'],
    [at(7, 0, 0), 'hard'], // 日付をまたぐ
    [at(7, 0, 30), 'hard'],
    [at(7, 5, 59, 59), 'hard'],
    [at(7, 6, 0), 'none'], // 06:00 自動解除
    [at(7, 6, 1), 'none'],
  ] as const)('%s → %s', (now, expected) => {
    expect(getStage(S, now)).toBe(expected);
  });
});

describe('getStage（カスタム設定）', () => {
  it('段階が日付をまたいで設定されていても正しく判定する', () => {
    const s: Settings = { ...S, prepareTime: '23:50', softTime: '00:15', hardTime: '00:30' };
    expect(getStage(s, at(6, 23, 49))).toBe('none');
    expect(getStage(s, at(6, 23, 50))).toBe('prepare');
    expect(getStage(s, at(7, 0, 14))).toBe('prepare');
    expect(getStage(s, at(7, 0, 15))).toBe('soft');
    expect(getStage(s, at(7, 0, 30))).toBe('hard');
    expect(getStage(s, at(7, 6, 0))).toBe('none');
  });

  it('自動解除時刻を変更できる', () => {
    const s: Settings = { ...S, releaseTime: '05:00' };
    expect(getStage(s, at(7, 4, 59))).toBe('hard');
    expect(getStage(s, at(7, 5, 0))).toBe('none');
  });
});

describe('getNextTransition', () => {
  it('次の段階までの時刻を返す', () => {
    const r = getNextTransition(S, at(6, 23, 10, 30));
    expect(r.to).toBe('soft');
    expect(r.at.getTime()).toBe(at(6, 23, 15).getTime());
  });
  it('日中は寝る準備が次', () => {
    const r = getNextTransition(S, at(6, 10, 0));
    expect(r.to).toBe('prepare');
    expect(r.at.getTime()).toBe(at(6, 22, 45).getTime());
  });
  it('hard の次は翌朝の自動解除', () => {
    const r = getNextTransition(S, at(7, 0, 30));
    expect(r.to).toBe('none');
    expect(r.at.getTime()).toBe(at(7, 6, 0).getTime());
  });
  it('23:45 でも翌日 06:00 を指す', () => {
    const r = getNextTransition(S, at(6, 23, 45));
    expect(r.at.getTime()).toBe(at(7, 6, 0).getTime());
  });
});

describe('validateSettings / mergeSettings', () => {
  it('初期値は正しい', () => {
    expect(validateSettings(S)).toEqual([]);
  });
  it('段階の順序が逆だと弾く', () => {
    expect(validateSettings({ ...S, softTime: '23:40' })).not.toEqual([]);
  });
  it('段階が自動解除と同時刻だと弾く', () => {
    expect(validateSettings({ ...S, hardTime: '06:00' })).not.toEqual([]);
  });
  it('不正な時刻・数値を弾く', () => {
    expect(validateSettings({ ...S, wakeTime: '25:00' })).not.toEqual([]);
    expect(validateSettings({ ...S, waitSeconds: -1 })).not.toEqual([]);
    expect(validateSettings({ ...S, unlockMinutes: 0 })).not.toEqual([]);
  });
  it('壊れた保存値は初期値に戻す', () => {
    expect(mergeSettings({ softTime: 'xx' })).toEqual(S);
    expect(mergeSettings({ waitSeconds: 45 }).waitSeconds).toBe(45);
    expect(mergeSettings(undefined)).toEqual(S);
  });
});

describe('isEditLocked', () => {
  it('soft / hard のときだけ編集できない', () => {
    expect(isEditLocked('none')).toBe(false);
    expect(isEditLocked('prepare')).toBe(false);
    expect(isEditLocked('soft')).toBe(true);
    expect(isEditLocked('hard')).toBe(true);
  });
});

describe('今夜の解除回数', () => {
  const ev = (when: Date, kind: GuardEvent['kind'] = 'unlocked'): GuardEvent => ({
    at: when.toISOString(),
    kind,
    site: 'youtube',
  });
  it('nightStart は直近の 06:00', () => {
    expect(nightStart(at(7, 1, 0), '06:00').getTime()).toBe(at(6, 6, 0).getTime());
    expect(nightStart(at(6, 23, 0), '06:00').getTime()).toBe(at(6, 6, 0).getTime());
    expect(nightKey(at(7, 1, 0), '06:00')).toBe('2026-10-06');
  });
  it('前夜の分と blocked は数えない', () => {
    const events = [
      ev(at(5, 23, 40)), // 前の夜
      ev(at(6, 23, 40)),
      ev(at(7, 0, 10)),
      ev(at(7, 0, 20), 'blocked'),
    ];
    expect(countUnlocksTonight(events, at(7, 0, 30), '06:00')).toBe(2);
    expect(countUnlocksTonight(events, at(7, 7, 0), '06:00')).toBe(0); // 朝になればリセット
  });
});
