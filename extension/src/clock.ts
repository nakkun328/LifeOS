// 現在時刻の取得はすべてここを通す。
// 時刻固定（デバッグ）は開発ビルド（__DEV__ = true）にだけ含まれ、通常ビルドでは削除される。
const OFFSET_KEY = 'debugOffsetMs';

export async function getClockOffsetMs(): Promise<number> {
  if (__DEV__) {
    const r = await chrome.storage.local.get(OFFSET_KEY);
    const v = r[OFFSET_KEY];
    return typeof v === 'number' ? v : 0;
  }
  return 0;
}

export async function getNow(): Promise<Date> {
  return new Date(Date.now() + (await getClockOffsetMs()));
}

/** 仮想時刻を設定（以降は実時間どおりに進む）。hm が null なら解除 */
export async function setDebugTime(hm: string | null): Promise<void> {
  if (__DEV__) {
    if (hm === null) {
      await chrome.storage.local.remove(OFFSET_KEY);
      return;
    }
    const [h, m] = hm.split(':').map(Number);
    const target = new Date();
    target.setHours(h ?? 0, m ?? 0, 0, 0);
    await chrome.storage.local.set({ [OFFSET_KEY]: target.getTime() - Date.now() });
  }
}

/** storage の変更に仮想時刻の変更が含まれるか（通常ビルドでは常に false） */
export function isClockChange(changes: Record<string, unknown>): boolean {
  if (__DEV__) return OFFSET_KEY in changes;
  return false;
}
