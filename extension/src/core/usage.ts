import { isHost } from './hosts';

/** 利用時間のカテゴリ。youtube_music は「減らしたい時間」に含めない */
export type UsageCategory = 'youtube' | 'youtube_shorts' | 'youtube_music' | 'x' | 'instagram' | 'tiktok';

/**
 * 計測の対象か判定する。制限の判定（classify）と違い、音楽も別枠として数える。
 * - music.youtube.com と、許可した再生リスト（/watch・/playlist の list=）は youtube_music
 */
export function classifyUsage(rawUrl: string, allowedPlaylists: string[]): UsageCategory | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();

  if (host === 'music.youtube.com') return 'youtube_music';
  if (isHost(host, 'youtube.com')) {
    if (url.pathname.startsWith('/shorts/')) return 'youtube_shorts';
    const list = url.searchParams.get('list');
    const isPlaylistPage = url.pathname === '/watch' || url.pathname === '/playlist';
    if (list && isPlaylistPage && allowedPlaylists.includes(list)) return 'youtube_music';
    return 'youtube';
  }
  if (isHost(host, 'x.com') || isHost(host, 'twitter.com')) return 'x';
  if (isHost(host, 'instagram.com')) return 'instagram';
  if (isHost(host, 'tiktok.com')) return 'tiktok';
  return null;
}

const MINUTE = 60_000;

/** [start, end) を1分ごとのバケットに分ける（ミリ秒） */
export function splitIntoMinutes(startMs: number, endMs: number): Array<{ minuteStart: number; ms: number }> {
  const out: Array<{ minuteStart: number; ms: number }> = [];
  let t = startMs;
  while (t < endMs) {
    const minuteStart = Math.floor(t / MINUTE) * MINUTE;
    const next = Math.min(endMs, minuteStart + MINUTE);
    out.push({ minuteStart, ms: next - t });
    t = next;
  }
  return out;
}

export type Buckets = Record<string, number>;

export const bucketKey = (minuteStart: number, category: UsageCategory): string =>
  `${new Date(minuteStart).toISOString()}|${category}`;

/** 区間をバケットに足し込む。同じ分に何度足しても1分（60000ms）を超えない */
export function addToBuckets(buckets: Buckets, category: UsageCategory, startMs: number, endMs: number): string[] {
  const touched: string[] = [];
  for (const { minuteStart, ms } of splitIntoMinutes(startMs, endMs)) {
    const k = bucketKey(minuteStart, category);
    buckets[k] = Math.min(MINUTE, (buckets[k] ?? 0) + ms);
    touched.push(k);
  }
  return touched;
}

/** 古いバケットを捨てる（再送時に値を引き継ぐために直近だけ持つ） */
export function pruneBuckets(buckets: Buckets, nowMs: number, keepMs = 2 * 3600_000): Buckets {
  const out: Buckets = {};
  for (const [k, v] of Object.entries(buckets)) {
    if (nowMs - Date.parse(k.split('|')[0]!) <= keepMs) out[k] = v;
  }
  return out;
}

/** 前回の同期からの経過時間を数えてよいか。長すぎる空白（スリープ等）は数えない */
export const MAX_GAP_MS = 150_000;
export const countableGap = (sinceMs: number, nowMs: number): number => {
  const gap = nowMs - sinceMs;
  return gap > 0 && gap <= MAX_GAP_MS ? gap : 0;
};

/**
 * 同じ時間を二重に数えないよう、数えるカテゴリは常に1つ。
 * 前面のタブが計測対象ならそれを、そうでなければ PiP で再生中の動画を数える。
 */
export const pickCategory = (foreground: UsageCategory | null, pip: UsageCategory | null): UsageCategory | null =>
  foreground ?? pip;
