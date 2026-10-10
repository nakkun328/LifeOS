// Web（日本時間で判定）と拡張（ブラウザの時刻で判定）の、制限の段階の判定が同じ結果になることを確かめる。
// 2か所に同じ規則があるので、片方だけ変えてずれたら、ここで気づけるようにする。
import { describe, expect, it } from 'vitest';
import { getGuardStage, validateGuard, validateSleep, type GuardSettings } from '../../../web/src/lib/appSettings';
import { fromServerSettings } from './serverSettings';
import { getStage } from './stage';

declare const process: { env: Record<string, string | undefined> }; // テスト実行時（Node）にだけ使う
process.env.TZ = 'Asia/Tokyo'; // 拡張はブラウザの時刻（日本）で判定する

const guards: GuardSettings[] = [
  { prepareTime: '22:45', level1Time: '23:15', level2Time: '23:30', releaseTime: '06:00', waitSeconds: 30, unlockMinutes: 10, allowedPlaylists: [] },
  { prepareTime: '23:50', level1Time: '00:15', level2Time: '00:30', releaseTime: '06:00', waitSeconds: 30, unlockMinutes: 10, allowedPlaylists: [] },
  { prepareTime: '22:00', level1Time: '22:30', level2Time: '23:00', releaseTime: '05:00', waitSeconds: 30, unlockMinutes: 10, allowedPlaylists: [] },
];

describe('Web と拡張で、制限の段階の判定が一致する', () => {
  it.each(guards.map((g, i) => [i, g] as const))('設定 %i：2日間を 1分刻みで比べる', (_i, g) => {
    const ext = fromServerSettings({ settings: { sleep: { targetBed: '23:30', wakeTime: '06:15' }, guard: g } });
    expect(ext).not.toBeNull();
    const start = Date.parse('2026-10-06T00:00:00+09:00');
    for (let m = 0; m < 2 * 1440; m += 1) {
      const d = new Date(start + m * 60_000);
      expect(getStage(ext!, d), d.toISOString()).toBe(getGuardStage(g, d));
    }
  });

  it.each([
    [0, '03:00'],
    [1, '03:00'],
    [2, '04:30'],
    [0, null],
  ] as const)('土曜の夜の「制限しない」も一致する：設定 %i・%s（1週間を 1分刻み）', (i, until) => {
    const g: GuardSettings = { ...guards[i]!, relaxSaturdayUntil: until };
    const ext = fromServerSettings({ settings: { sleep: { targetBed: '23:30', wakeTime: '06:15' }, guard: g } });
    expect(ext).not.toBeNull();
    const start = Date.parse('2026-10-05T00:00:00+09:00'); // 月曜
    for (let m = 0; m < 8 * 1440; m += 1) {
      const d = new Date(start + m * 60_000);
      expect(getStage(ext!, d), d.toISOString()).toBe(getGuardStage(g, d));
    }
  });

  it('設定の検証も同じ結論になる（通る・通らない）', () => {
    const cases: GuardSettings[] = [
      guards[0]!,
      { ...guards[0]!, level1Time: '23:45' },
      { ...guards[0]!, level2Time: '06:00' },
      { ...guards[0]!, waitSeconds: -1 },
      { ...guards[0]!, unlockMinutes: 0 },
      { ...guards[0]!, prepareTime: '25:00' },
      { ...guards[0]!, relaxSaturdayUntil: '03:00' },
      { ...guards[0]!, relaxSaturdayUntil: '23:00' },
      { ...guards[0]!, relaxSaturdayUntil: '25:00' },
      { ...guards[0]!, relaxSaturdayUntil: null },
    ];
    for (const g of cases) {
      const webOk = validateGuard(g).length === 0 && validateSleep({ targetBed: '23:30', wakeTime: '06:15' }).length === 0;
      const extOk = fromServerSettings({ settings: { sleep: { targetBed: '23:30', wakeTime: '06:15' }, guard: g } }) !== null;
      expect(extOk, JSON.stringify(g)).toBe(webOk);
    }
  });
});
