// 利用時間の計測。「実際に見ている」ときだけ数える：
//   - フォーカスされたウィンドウの、アクティブなタブ
//   - 前面が計測対象でないとき、ピクチャインピクチャ（PiP）で再生中の動画
//   - 画面ロック中は数えない。無操作（離席）中は、音が出ているタブ（動画視聴中）だけ数える
// 状態が変わるたびに、直前までの経過時間をそのカテゴリに加算する（sync）。
import { getNow } from './clock';
import {
  addToBuckets,
  classifyUsage,
  countableGap,
  pickCategory,
  pruneBuckets,
  type Buckets,
  type UsageCategory,
} from './core/usage';
import { PIP_STATE_MESSAGE, type PipState } from './pipState';
import { TAB_PATTERNS } from './sites';
import { enqueue } from './storage/remote';
import { loadSettings } from './storage/settings';

const TRACK_KEY = 'track';
const BUCKETS_KEY = 'usageBuckets';
export const IDLE_SECONDS = 180;

type Idle = 'active' | 'idle' | 'locked';
type Track = { category: UsageCategory; since: number } | null;

/** 前面のタブ（フォーカスされたウィンドウのアクティブなタブ） */
async function foregroundCategory(state: Idle, allowed: string[]): Promise<UsageCategory | null> {
  const win = await chrome.windows.getLastFocused().catch(() => null);
  if (!win?.focused || win.id === undefined) return null;
  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  if (!tab?.url) return null;
  if (state === 'idle' && !tab.audible) return null;
  return classifyUsage(tab.url, allowed);
}

/** PiP で再生中の動画があるタブ。別のタブや別のアプリを見ている間も数えるために探す */
async function pipCategory(state: Idle, allowed: string[]): Promise<UsageCategory | null> {
  const tabs = await chrome.tabs.query({ url: TAB_PATTERNS });
  for (const tab of tabs) {
    if (tab.id === undefined || !tab.url) continue;
    if (state === 'idle' && !tab.audible) continue; // 無操作でも、音が出ている動画は見ているとみなす
    const answer = (await chrome.tabs
      .sendMessage(tab.id, { type: PIP_STATE_MESSAGE })
      .catch(() => null)) as PipState | null; // スクリプトがまだ入っていないタブは無視
    if (!answer?.pip || !answer.playing) continue;
    const category = classifyUsage(tab.url, allowed);
    if (category) return category;
  }
  return null;
}

async function currentCategory(): Promise<UsageCategory | null> {
  const state = await chrome.idle.queryState(IDLE_SECONDS);
  if (state === 'locked') return null;
  const allowed = (await loadSettings()).allowedPlaylists;
  const foreground = await foregroundCategory(state, allowed);
  if (foreground) return pickCategory(foreground, null);
  return pickCategory(null, await pipCategory(state, allowed));
}

let chain: Promise<unknown> = Promise.resolve();

/** 状態が変わったときと、1分ごとに呼ぶ。同時に走らないよう直列化する */
export function syncTracking(): Promise<void> {
  const run = chain.then(doSync);
  chain = run.catch(() => undefined);
  return run;
}

async function doSync(): Promise<void> {
  const nowMs = (await getNow()).getTime();
  const stored = await chrome.storage.session.get(TRACK_KEY);
  const prev = (stored[TRACK_KEY] as Track | undefined) ?? null;

  if (prev) {
    const gap = countableGap(prev.since, nowMs);
    if (gap > 0) {
      const local = await chrome.storage.local.get(BUCKETS_KEY);
      const buckets = pruneBuckets((local[BUCKETS_KEY] as Buckets | undefined) ?? {}, nowMs);
      const touched = addToBuckets(buckets, prev.category, nowMs - gap, nowMs);
      await chrome.storage.local.set({ [BUCKETS_KEY]: buckets });
      await enqueue(
        ...touched.flatMap((k) => {
          const [start, category] = k.split('|') as [string, UsageCategory];
          const seconds = Math.round((buckets[k] ?? 0) / 1000);
          // 同じ分は同じ id で上書きされる。伸びた最新の値が送られる
          return seconds > 0 ? [{ id: `usage:${k}`, payload: { type: 'usage', start, category, seconds } }] : [];
        }),
      );
    }
  }

  const category = await currentCategory();
  await chrome.storage.session.set({ [TRACK_KEY]: category ? { category, since: nowMs } : null });
}
