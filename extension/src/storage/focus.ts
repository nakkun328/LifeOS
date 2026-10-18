import { nextFocusEnd } from '../core/focus';

const KEY = 'focusEndAt';

export async function getFocusEnd(): Promise<number | undefined> {
  const r = await chrome.storage.local.get(KEY);
  return typeof r[KEY] === 'number' ? (r[KEY] as number) : undefined;
}

/** 50分の集中を始める。すでに集中中なら、今の終了時刻のまま。取り消す関数は作らない */
export async function startFocus(nowMs: number): Promise<number> {
  const end = nextFocusEnd(await getFocusEnd(), nowMs);
  await chrome.storage.local.set({ [KEY]: end });
  return end;
}
