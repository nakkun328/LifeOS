// 制限・解除の記録はすべてこのモジュールを通す。
// Phase 2 では EventSink を1つ足す（Life OS Web の API へ送信）だけで済むようにしてある。
import { checkBlockDedupe } from '../core/dedupe';
import type { GuardEvent, Site } from '../core/types';
import { enqueue, flushOutbox } from './remote';

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

/** Life OS Web への送信。送れなかった分は outbox に残り、あとで再送される */
const remoteSink: EventSink = {
  async write(event) {
    if (!event.id) return;
    await enqueue({
      id: event.id,
      payload: { type: 'guard', id: event.id, at: event.at, kind: event.kind, site: event.site, reason: event.reason ?? null },
    });
    void flushOutbox();
  },
};

/** 書き込み先。ここに足せば記録の送信先を増やせる */
const sinks: EventSink[] = [localSink, remoteSink];

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
  if (record) await recordEvent({ id: crypto.randomUUID(), at: now.toISOString(), kind: 'blocked', site });
}

export async function recordUnlocked(site: Site, reason: string, now: Date): Promise<void> {
  await recordEvent({ id: crypto.randomUUID(), at: now.toISOString(), kind: 'unlocked', site, reason });
}
