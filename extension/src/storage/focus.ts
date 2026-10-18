import { nextPlan, type FocusMode, type FocusPlan } from '../core/focus';

const KEY = 'focusPlan';

export async function getFocusPlan(): Promise<FocusPlan | undefined> {
  const r = await chrome.storage.local.get(KEY);
  return r[KEY] as FocusPlan | undefined;
}

/** 集中を始める。進行中なら、今の計画のまま。取り消す関数は作らない */
export async function startFocus(mode: FocusMode, sets: number, nowMs: number): Promise<FocusPlan> {
  const plan = nextPlan(await getFocusPlan(), mode, sets, nowMs);
  await chrome.storage.local.set({ [KEY]: plan });
  return plan;
}
