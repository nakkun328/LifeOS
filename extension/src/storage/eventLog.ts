// 制限・解除の記録はすべてこのモジュールを通す。
// Phase 2 では EventSink を1つ足す（Life OS Web の API へ送信）だけで済むようにしてある。
import { checkBlockDedupe } from '../core/dedupe';
import type { GuardEvent, Site } from '../core/types';

export interface EventSink {
  write(event: GuardEvent): Promise<void>;
}

const EVENTS_KEY = 'events';
const MAX_EVENTS = 1000;

// 同一コンテキスト内の read-modify-write が重ならないよう直列化する
let queue: Promise<unknown> = Promise.resolve();

const localSink: EventSink = {
  write(event) {
    const task = queue.then(async () => {
      const r = await chrome.storage.local.get(EVENTS_KEY);
      const events = ((r[EVENTS_KEY] as GuardEvent[] | undefined) ?? []).concat(event);
      await chrome.storage.local.set({ [EVENTS_KEY]: events.slice(-MAX_EVENTS) });
    });
    queue = task.catch(() => undefined);
    return task;
  },
};

/** 書き込み先。Phase 2 でここに送信用のシンクを追加する */
const sinks: EventSink[] = [localSink];

export async function recordEvent(event: GuardEvent): Promise<void> {
  await Promise.all(sinks.map((s) => s.write(event)));
}

export async function getEvents(): Promise<GuardEvent[]> {
  const r = await chrome.storage.local.get(EVENTS_KEY);
  return (r[EVENTS_KEY] as GuardEvent[] | undefined) ?? [];
}

/** 制限した出来事を記録。同一タブ・同一サイトで60秒以内なら1件にまとめる */
export async function recordBlocked(site: Site, tabId: number, now: Date): Promise<void> {
  const r = await chrome.storage.session.get('blockDedupe');
  const last = (r.blockDedupe as Record<string, number> | undefined) ?? {};
  const { record, next } = checkBlockDedupe(last, `${tabId}:${site}`, now.getTime());
  await chrome.storage.session.set({ blockDedupe: next });
  if (record) await recordEvent({ at: now.toISOString(), kind: 'blocked', site });
}

export async function recordUnlocked(site: Site, reason: string, now: Date): Promise<void> {
  await recordEvent({ at: now.toISOString(), kind: 'unlocked', site, reason });
}
