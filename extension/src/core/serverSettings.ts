// Life OS の Settings（サーバー）→ 拡張の設定への変換。
// 拡張の設定は、Life OS の Settings が唯一の正。ここで形を検証し、おかしな値は取り込まない。
import { validateSettings } from './settings';
import type { Settings } from './types';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : null);

/**
 * GET /api/settings の応答を、拡張の Settings にする。
 * 形が違う・検証に通らない場合は null（そのときは、手元に保存済みの値のまま動く）。
 */
export function fromServerSettings(json: unknown): Settings | null {
  const settings = obj(obj(json)?.settings);
  const sleep = obj(settings?.sleep);
  const guard = obj(settings?.guard);
  if (!sleep || !guard) return null;

  const playlists = guard.allowedPlaylists;
  if (!Array.isArray(playlists) || playlists.some((p) => typeof p !== 'string')) return null;
  const mapped = {
    prepareTime: guard.prepareTime,
    softTime: guard.level1Time,
    hardTime: guard.level2Time,
    releaseTime: guard.releaseTime,
    wakeTime: sleep.wakeTime,
    waitSeconds: guard.waitSeconds,
    unlockMinutes: guard.unlockMinutes,
    allowedPlaylists: playlists as string[],
  };
  const times = [mapped.prepareTime, mapped.softTime, mapped.hardTime, mapped.releaseTime, mapped.wakeTime];
  if (times.some((t) => typeof t !== 'string') || typeof mapped.waitSeconds !== 'number' || typeof mapped.unlockMinutes !== 'number') return null;

  const relax = guard.relaxSaturdayUntil;
  if (relax !== undefined && relax !== null && typeof relax !== 'string') return null;
  const result = { ...mapped, relaxSaturdayUntil: relax ?? null } as Settings;
  return validateSettings(result).length === 0 ? result : null;
}
