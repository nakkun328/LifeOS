import { isHost } from './hosts';
import type { Stage, Target, Unlocks } from './types';

/** URL でも ID でも受け取り、再生リストID を返す */
export function normalizePlaylistId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  try {
    const list = new URL(trimmed).searchParams.get('list');
    if (list) return list;
  } catch {
    // URLではない → IDとして扱う
  }
  return trimmed;
}

/** 制限の対象外なら null。music.youtube.com と許可した再生リストは対象外 */
export function classify(rawUrl: string, allowedPlaylists: string[]): Target | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();

  if (host === 'music.youtube.com') return null;
  if (isHost(host, 'youtube.com')) {
    if (url.pathname.startsWith('/shorts/')) return { site: 'youtube', isShorts: true };
    const list = url.searchParams.get('list');
    const isPlaylistPage = url.pathname === '/watch' || url.pathname === '/playlist';
    if (list && isPlaylistPage && allowedPlaylists.includes(list)) return null;
    return { site: 'youtube', isShorts: false };
  }
  if (isHost(host, 'x.com') || isHost(host, 'twitter.com')) return { site: 'x', isShorts: false };
  if (isHost(host, 'instagram.com')) return { site: 'instagram', isShorts: false };
  return null;
}

/**
 * - soft 以降: Shorts・X・Instagram
 * - hard 以降: YouTube 全体（ホーム・検索・チャンネルも）
 * - サイト別の一時解除中は通す
 */
export function shouldBlock(stage: Stage, target: Target, unlocks: Unlocks, nowMs: number): boolean {
  if (stage !== 'soft' && stage !== 'hard') return false;
  if (target.site === 'youtube' && !target.isShorts && stage !== 'hard') return false;
  const until = unlocks[target.site];
  if (until !== undefined && until > nowMs) return false;
  return true;
}
