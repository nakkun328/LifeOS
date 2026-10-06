import { getNow } from './clock';
import { normalizePlaylistId } from './core/match';
import { isEditLocked } from './core/settings';
import { getStage } from './core/stage';
import type { Settings } from './core/types';
import { loadSettings, saveSettings } from './storage/settings';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const TIME_FIELDS = ['prepareTime', 'softTime', 'hardTime', 'releaseTime', 'wakeTime'] as const;
const NUM_FIELDS = ['waitSeconds', 'unlockMinutes'] as const;

function fill(s: Settings): void {
  for (const k of TIME_FIELDS) $<HTMLInputElement>(k).value = s[k];
  for (const k of NUM_FIELDS) $<HTMLInputElement>(k).value = String(s[k]);
  $<HTMLTextAreaElement>('playlists').value = s.allowedPlaylists.join('\n');
}

function collect(): Settings {
  const s = {} as Settings;
  for (const k of TIME_FIELDS) s[k] = $<HTMLInputElement>(k).value;
  for (const k of NUM_FIELDS) s[k] = Number($<HTMLInputElement>(k).value);
  s.allowedPlaylists = $<HTMLTextAreaElement>('playlists')
    .value.split('\n')
    .map(normalizePlaylistId)
    .filter((v) => v !== '');
  return s;
}

/** 制限中（soft / hard）は入力欄を無効化して表示のみにする */
async function refreshLock(): Promise<void> {
  const locked = isEditLocked(getStage(await loadSettings(), await getNow()));
  document
    .querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>(
      'main input:not(.dev), main textarea, #save',
    )
    .forEach((el) => {
      el.disabled = locked;
    });
  $('lockBanner').hidden = !locked;
}

async function init(): Promise<void> {
  fill(await loadSettings());
  await refreshLock();
  setInterval(() => void refreshLock(), 3000);

  $('save').addEventListener('click', async () => {
    $('error').textContent = '';
    $('ok').textContent = '';
    try {
      await saveSettings(collect());
      fill(await loadSettings());
      $('ok').textContent = '保存しました';
    } catch (e) {
      $('error').textContent = e instanceof Error ? e.message : String(e);
    }
  });

  if (__DEV__) {
    const { mountDebugPanel } = await import('./debugPanel');
    mountDebugPanel($('debugRoot'));
  }
}

void init();
