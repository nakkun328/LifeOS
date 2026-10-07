import { mergeSettings } from '../core/settings';
import type { Settings } from '../core/types';

const KEY = 'settings';

/**
 * 設定は、Life OS の Settings から同期した値（storage/syncSettings.ts）が唯一の正。
 * 拡張の中で書き換える画面はない。API が未設定のときは、保存済みの値（なければ初期値）で動く。
 */
export async function loadSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get(KEY);
  return mergeSettings(r[KEY] as Partial<Settings> | undefined);
}
