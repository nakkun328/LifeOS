import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APP_SETTINGS,
  getGuardStage,
  isGuardLocked,
  mergeAppSettings,
  normalizePlaylist,
  validateAppSettings,
  validateGuard,
} from './appSettings';

const jst = (s: string) => new Date(`${s}+09:00`);
const G = DEFAULT_APP_SETTINGS.guard;

describe('初期値', () => {
  it('検証に通る。起床予定は 06:15', () => {
    expect(validateAppSettings(DEFAULT_APP_SETTINGS)).toEqual([]);
    expect(DEFAULT_APP_SETTINGS.sleep.wakeTime).toBe('06:15');
  });
  it('TikTok は減らしたいサービス。音楽は除外', () => {
    expect(DEFAULT_APP_SETTINGS.digital.reduce).toContain('tiktok');
    expect(DEFAULT_APP_SETTINGS.digital.exclude).toContain('youtube_music');
  });
});

describe('validateGuard', () => {
  it('順序が逆・自動解除と同時刻・範囲外を弾く', () => {
    expect(validateGuard({ ...G, level1Time: '23:40' })).not.toEqual([]);
    expect(validateGuard({ ...G, level2Time: '06:00' })).not.toEqual([]);
    expect(validateGuard({ ...G, waitSeconds: -1 })).not.toEqual([]);
    expect(validateGuard({ ...G, unlockMinutes: 0 })).not.toEqual([]);
    expect(validateGuard({ ...G, prepareTime: '25:00' })).not.toEqual([]);
  });
  it('日付をまたぐ設定も通る', () => {
    expect(validateGuard({ ...G, prepareTime: '23:50', level1Time: '00:15', level2Time: '00:30' })).toEqual([]);
  });
});

describe('mergeAppSettings', () => {
  it('空・壊れた保存値は初期値になる', () => {
    expect(mergeAppSettings(undefined)).toEqual(DEFAULT_APP_SETTINGS);
    expect(mergeAppSettings('x')).toEqual(DEFAULT_APP_SETTINGS);
    expect(mergeAppSettings({ guard: { level1Time: 'xx' } }).guard).toEqual(DEFAULT_APP_SETTINGS.guard);
  });
  it('一部だけの保存値は、残りを初期値で埋める', () => {
    const s = mergeAppSettings({ sleep: { wakeTime: '07:00' }, guard: { waitSeconds: 45 } });
    expect(s.sleep).toEqual({ targetBed: '23:30', wakeTime: '07:00' });
    expect(s.guard.waitSeconds).toBe(45);
    expect(s.guard.level1Time).toBe('23:15');
  });
  it('サービス名は小文字・空白除去・重複排除', () => {
    const s = mergeAppSettings({ digital: { reduce: [' TikTok ', 'tiktok', 'X', ''], exclude: [] } });
    expect(s.digital.reduce).toEqual(['tiktok', 'x']);
    expect(s.digital.exclude).toEqual([]);
  });
});

describe('getGuardStage（日本時間）', () => {
  it.each([
    ['2026-10-06T12:00:00', 'none'],
    ['2026-10-06T22:44:59', 'none'],
    ['2026-10-06T22:45:00', 'prepare'],
    ['2026-10-06T23:15:00', 'soft'],
    ['2026-10-06T23:30:00', 'hard'],
    ['2026-10-07T00:30:00', 'hard'],
    ['2026-10-07T05:59:59', 'hard'],
    ['2026-10-07T06:00:00', 'none'],
  ] as const)('%s → %s', (t, stage) => expect(getGuardStage(G, jst(t))).toBe(stage));

  it('UTC の時刻でも、日本時間で判定する', () => {
    expect(getGuardStage(G, new Date('2026-10-06T14:20:00Z'))).toBe('soft'); // JST 23:20
  });
  it('制限中（soft / hard）だけロックする', () => {
    expect(isGuardLocked('none')).toBe(false);
    expect(isGuardLocked('prepare')).toBe(false);
    expect(isGuardLocked('soft')).toBe(true);
    expect(isGuardLocked('hard')).toBe(true);
  });
});

describe('normalizePlaylist', () => {
  it('URL でも ID でも ID にする', () => {
    expect(normalizePlaylist('https://www.youtube.com/playlist?list=PLabc')).toBe('PLabc');
    expect(normalizePlaylist(' PLabc ')).toBe('PLabc');
    expect(normalizePlaylist('')).toBe('');
  });
});
