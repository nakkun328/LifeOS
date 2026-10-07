import { describe, expect, it } from 'vitest';
import { fromServerSettings } from './serverSettings';

const server = (over: { sleep?: object; guard?: object } = {}) => ({
  settings: {
    sleep: { targetBed: '23:30', wakeTime: '06:15', ...over.sleep },
    guard: {
      prepareTime: '22:45',
      level1Time: '23:15',
      level2Time: '23:30',
      releaseTime: '06:00',
      waitSeconds: 30,
      unlockMinutes: 10,
      allowedPlaylists: ['PLabc'],
      ...over.guard,
    },
    digital: { reduce: ['x'], exclude: [] },
  },
  stage: 'none',
  locked: false,
});

describe('fromServerSettings', () => {
  it('サーバーの Settings を、拡張の設定に変換する（Level 1 → softTime、Level 2 → hardTime、起床は Sleep から）', () => {
    expect(fromServerSettings(server())).toEqual({
      prepareTime: '22:45',
      softTime: '23:15',
      hardTime: '23:30',
      releaseTime: '06:00',
      wakeTime: '06:15',
      waitSeconds: 30,
      unlockMinutes: 10,
      allowedPlaylists: ['PLabc'],
    });
  });

  it('起床時刻を Settings で変えると、拡張の起床時刻も変わる（起床時刻の唯一の正）', () => {
    expect(fromServerSettings(server({ sleep: { wakeTime: '07:30' } }))?.wakeTime).toBe('07:30');
  });

  it('形が違うもの・検証に通らないものは取り込まない（null）', () => {
    expect(fromServerSettings(null)).toBeNull();
    expect(fromServerSettings({})).toBeNull();
    expect(fromServerSettings({ settings: {} })).toBeNull();
    expect(fromServerSettings(server({ guard: { level1Time: 'xx' } }))).toBeNull();
    expect(fromServerSettings(server({ guard: { level1Time: '23:45' } }))).toBeNull(); // 順序が逆
    expect(fromServerSettings(server({ guard: { waitSeconds: '30' } }))).toBeNull(); // 数値でない
    expect(fromServerSettings(server({ guard: { allowedPlaylists: 'PLabc' } }))).toBeNull();
    expect(fromServerSettings(server({ guard: { allowedPlaylists: [1] } }))).toBeNull();
    expect(fromServerSettings(server({ sleep: { wakeTime: '25:00' } }))).toBeNull();
  });
});
