import { isEditLocked, mergeSettings, validateSettings } from '../core/settings';
import { getStage } from '../core/stage';
import type { Settings } from '../core/types';
import { getNow } from '../clock';

const KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get(KEY);
  return mergeSettings(r[KEY] as Partial<Settings> | undefined);
}

/** 制限中（soft / hard）は保存を拒否する。判定は「保存済みの設定 × 現在時刻」で行う */
export async function saveSettings(next: Settings): Promise<void> {
  const errors = validateSettings(next);
  if (errors.length > 0) throw new Error(errors.join('\n'));
  const current = await loadSettings();
  if (isEditLocked(getStage(current, await getNow()))) {
    throw new Error('制限中は設定を変更できません');
  }
  await chrome.storage.local.set({ [KEY]: next });
}
