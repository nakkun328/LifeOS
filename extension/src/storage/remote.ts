// Life OS Web の API への送信。保存できなかった（送れなかった）分は outbox に溜めて、あとで再送する。
// 送信先の設定（URL・トークン）は時間帯ロックの対象外：夜に変えても制限の回避にならないため。
import { removeSent, upsertItem, type OutboxItem } from '../core/outbox';

export type RemoteSettings = { apiUrl: string; apiToken: string };

const REMOTE_KEY = 'remote';
const OUTBOX_KEY = 'outbox';
const STATUS_KEY = 'remoteStatus';
const BATCH = 200;

export async function loadRemote(): Promise<RemoteSettings> {
  const r = await chrome.storage.local.get(REMOTE_KEY);
  const v = r[REMOTE_KEY] as Partial<RemoteSettings> | undefined;
  return { apiUrl: v?.apiUrl ?? '', apiToken: v?.apiToken ?? '' };
}

export const isConfigured = (r: RemoteSettings): boolean => r.apiUrl !== '' && r.apiToken !== '';

export function normalizeApiUrl(input: string): string {
  const t = input.trim().replace(/\/+$/, '');
  if (!t) return '';
  const u = new URL(t); // 不正なら例外
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && u.hostname === 'localhost')) {
    throw new Error('URL は https:// で始めてください（開発時のみ http://localhost 可）');
  }
  return u.origin + (u.pathname === '/' ? '' : u.pathname);
}

/** 保存と同時に、その送信先へのアクセス許可をユーザー操作の中で求める */
export async function saveRemote(input: RemoteSettings): Promise<void> {
  const apiUrl = normalizeApiUrl(input.apiUrl);
  if (apiUrl) {
    const origin = new URL(apiUrl).origin + '/*';
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) throw new Error('送信先へのアクセスが許可されませんでした');
  }
  await chrome.storage.local.set({ [REMOTE_KEY]: { apiUrl, apiToken: input.apiToken.trim() } });
}

// 同一コンテキスト内の read-modify-write を直列化する
let lock: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn);
  lock = run.catch(() => undefined);
  return run;
}

async function readOutbox(): Promise<OutboxItem[]> {
  const r = await chrome.storage.local.get(OUTBOX_KEY);
  return (r[OUTBOX_KEY] as OutboxItem[] | undefined) ?? [];
}

export function enqueue(...items: OutboxItem[]): Promise<void> {
  return withLock(async () => {
    let q = await readOutbox();
    for (const it of items) q = upsertItem(q, it);
    await chrome.storage.local.set({ [OUTBOX_KEY]: q });
  });
}

export async function outboxSize(): Promise<number> {
  return (await readOutbox()).length;
}

export type RemoteStatus = { lastError: string | null; lastSentAt: string | null };

export async function getRemoteStatus(): Promise<RemoteStatus> {
  const r = await chrome.storage.local.get(STATUS_KEY);
  return (r[STATUS_KEY] as RemoteStatus | undefined) ?? { lastError: null, lastSentAt: null };
}

let flushing: Promise<void> | null = null;

/** 溜まった分を送る。失敗したら残しておく（次の機会に再送）。同時に2回走らない */
export function flushOutbox(): Promise<void> {
  flushing ??= doFlush().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function doFlush(): Promise<void> {
  const remote = await loadRemote();
  if (!isConfigured(remote)) return;
  for (;;) {
    const batch = (await readOutbox()).slice(0, BATCH);
    if (batch.length === 0) return;
    try {
      const res = await fetch(`${remote.apiUrl}/api/ingest`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${remote.apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: batch.map((b) => b.payload) }),
      });
      if (!res.ok) throw new Error(res.status === 401 ? 'トークンが正しくありません' : `送信に失敗しました (${res.status})`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const prev = await getRemoteStatus();
      await chrome.storage.local.set({ [STATUS_KEY]: { ...prev, lastError: message } });
      return;
    }
    await withLock(async () => {
      const q = removeSent(await readOutbox(), batch);
      await chrome.storage.local.set({
        [OUTBOX_KEY]: q,
        [STATUS_KEY]: { lastError: null, lastSentAt: new Date().toISOString() },
      });
    });
  }
}

/** 「寝る」：オフラインでも失われないよう、同じキューに積む。id は再送時の重複排除に使う */
export async function enqueueBed(at: Date): Promise<void> {
  const id = crypto.randomUUID();
  await enqueue({ id, payload: { type: 'bed', id, at: at.toISOString() } });
  await flushOutbox();
}
