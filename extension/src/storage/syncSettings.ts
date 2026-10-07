// Life OS の Settings を取得して、手元（chrome.storage.local の settings）に保存する。
// オフラインや API 未設定のときは何もせず、最後に取得した値（または初期値）で動く。
import { fromServerSettings } from '../core/serverSettings';
import { isConfigured, loadRemote } from './remote';

const SETTINGS_KEY = 'settings';
const STATUS_KEY = 'settingsSync';
export const SYNC_INTERVAL_MS = 10 * 60_000;

export type SyncStatus = { lastAttemptAt: number | null; lastSyncedAt: number | null; lastError: string | null };

export async function getSyncStatus(): Promise<SyncStatus> {
  const r = await chrome.storage.local.get(STATUS_KEY);
  return (r[STATUS_KEY] as SyncStatus | undefined) ?? { lastAttemptAt: null, lastSyncedAt: null, lastError: null };
}

/** force でなければ、前回の試行から SYNC_INTERVAL_MS 以上たっているときだけ取りに行く */
export async function syncSettings(force = false): Promise<void> {
  const remote = await loadRemote();
  if (!isConfigured(remote)) return;
  const prev = await getSyncStatus();
  const nowMs = Date.now();
  if (!force && prev.lastAttemptAt !== null && nowMs - prev.lastAttemptAt < SYNC_INTERVAL_MS) return;

  const save = (patch: Partial<SyncStatus>) => chrome.storage.local.set({ [STATUS_KEY]: { ...prev, lastAttemptAt: nowMs, ...patch } });
  try {
    const res = await fetch(`${remote.apiUrl}/api/settings`, {
      headers: { Authorization: `Bearer ${remote.apiToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(res.status === 401 ? 'トークンが正しくありません' : `設定を取得できませんでした (${res.status})`);
    const next = fromServerSettings(await res.json());
    if (!next) throw new Error('取得した設定の形が正しくありません（取り込みませんでした）');
    // サーバーが Sleep・Night Guard の変更を制限中は拒否するので、ここでは時間帯のロックをかけない
    await chrome.storage.local.set({ [SETTINGS_KEY]: next });
    await save({ lastSyncedAt: nowMs, lastError: null });
  } catch (e) {
    await save({ lastError: e instanceof Error ? e.message : String(e) }); // 手元の値はそのまま
  }
}
