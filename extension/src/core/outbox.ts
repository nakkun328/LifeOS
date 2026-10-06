// 送信待ちキュー（純粋関数）。保存と通信は storage/remote.ts が担当する。
export type OutboxItem = { id: string; payload: Record<string, unknown> };

export const MAX_OUTBOX = 5000;

/** 同じ id があれば置き換える（利用時間のバケットが伸びたとき） */
export function upsertItem(items: OutboxItem[], item: OutboxItem): OutboxItem[] {
  const i = items.findIndex((x) => x.id === item.id);
  const next = i < 0 ? [...items, item] : items.map((x, j) => (j === i ? item : x));
  return next.length > MAX_OUTBOX ? next.slice(next.length - MAX_OUTBOX) : next;
}

/**
 * 送信に成功した分を取り除く。送信中に内容が更新されたものは残す
 * （更新前の値を送ったあとに消すと、更新分が失われるため）。
 */
export function removeSent(items: OutboxItem[], sent: OutboxItem[]): OutboxItem[] {
  const sentJson = new Map(sent.map((s) => [s.id, JSON.stringify(s.payload)]));
  return items.filter((x) => sentJson.get(x.id) !== JSON.stringify(x.payload));
}
