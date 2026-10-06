import type { Site, Unlocks } from '../core/types';

const KEY = 'unlocks';

export async function getUnlocks(): Promise<Unlocks> {
  const r = await chrome.storage.local.get(KEY);
  return (r[KEY] as Unlocks | undefined) ?? {};
}

/** サイト別に、一時解除の期限（epoch ms）を保存する */
export async function setUnlock(site: Site, untilMs: number, nowMs: number): Promise<void> {
  const current = await getUnlocks();
  const next: Unlocks = {};
  for (const [s, t] of Object.entries(current) as Array<[Site, number]>) {
    if (t > nowMs) next[s] = t;
  }
  next[site] = untilMs;
  await chrome.storage.local.set({ [KEY]: next });
}
