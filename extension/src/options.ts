import type { Settings } from './core/types';
import { getRemoteStatus, loadRemote, outboxSize, saveRemote } from './storage/remote';
import { loadSettings } from './storage/settings';
import { getSyncStatus, syncSettings } from './storage/syncSettings';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** 同期した設定を表示する（変更は Life OS の Settings で行う） */
function showSettings(s: Settings): void {
  const text = (id: string, v: string) => ($(id).textContent = v);
  text('v-prepareTime', s.prepareTime);
  text('v-softTime', s.softTime);
  text('v-hardTime', s.hardTime);
  text('v-releaseTime', s.releaseTime);
  text('v-wakeTime', s.wakeTime);
  text('v-waitSeconds', `${s.waitSeconds} 秒`);
  text('v-unlockMinutes', `${s.unlockMinutes} 分`);
  text('v-allowedPlaylists', s.allowedPlaylists.length === 0 ? 'なし' : `${s.allowedPlaylists.length} 件`);
}

async function showSyncStatus(): Promise<void> {
  const [remote, status] = await Promise.all([loadRemote(), getSyncStatus()]);
  const connected = remote.apiUrl !== '' && remote.apiToken !== '';
  const parts: string[] = [];
  if (!connected) parts.push('Life OS に未接続です（この拡張に保存されている値で動いています）');
  else if (status.lastSyncedAt) parts.push(`最後に同期：${new Date(status.lastSyncedAt).toLocaleString('ja-JP')}`);
  else parts.push('まだ同期していません');
  $('syncStatus').textContent = parts.join(' ／ ');
  $('syncError').textContent = connected && status.lastError ? `直近の同期のエラー：${status.lastError}（最後に取得した値で動いています）` : '';
}

async function showRemoteStatus(): Promise<void> {
  const [status, size] = await Promise.all([getRemoteStatus(), outboxSize()]);
  const parts = [`未送信 ${size} 件`];
  if (status.lastSentAt) parts.push(`最後に送信：${new Date(status.lastSentAt).toLocaleString('ja-JP')}`);
  if (status.lastError) parts.push(`直近のエラー：${status.lastError}`);
  $('remoteStatus').textContent = parts.join(' ／ ');
}

async function refresh(): Promise<void> {
  showSettings(await loadSettings());
  await Promise.all([showSyncStatus(), showRemoteStatus()]);
}

async function init(): Promise<void> {
  const remote = await loadRemote();
  $<HTMLInputElement>('apiUrl').value = remote.apiUrl;
  $<HTMLInputElement>('apiToken').value = remote.apiToken;
  await refresh();
  setInterval(() => void refresh(), 5000);

  $('syncNow').addEventListener('click', async () => {
    $('syncOk').textContent = '';
    await syncSettings(true);
    await refresh();
    const st = await getSyncStatus();
    $('syncOk').textContent = st.lastError ? '' : '同期しました';
  });

  $('saveRemote').addEventListener('click', async () => {
    $('remoteError').textContent = '';
    $('remoteOk').textContent = '';
    try {
      await saveRemote({ apiUrl: $<HTMLInputElement>('apiUrl').value, apiToken: $<HTMLInputElement>('apiToken').value });
      const saved = await loadRemote();
      $<HTMLInputElement>('apiUrl').value = saved.apiUrl;
      $('remoteOk').textContent = '保存しました';
      await syncSettings(true); // 接続できたら、すぐ設定を取り込む
      await refresh();
    } catch (e) {
      $('remoteError').textContent = e instanceof Error ? e.message : String(e);
    }
  });

  if (__DEV__) {
    const { mountDebugPanel } = await import('./debugPanel');
    mountDebugPanel($('debugRoot'));
  }
}

void init();
