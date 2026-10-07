import { describe, expect, it } from 'vitest';
import { classify, normalizePlaylistId, shouldBlock } from './match';
import type { Target } from './types';

const NOW = 1_000_000;
const none = {};

describe('classify', () => {
  it('music.youtube.com は常に対象外', () => {
    expect(classify('https://music.youtube.com/watch?v=abc', [])).toBeNull();
    expect(classify('https://music.youtube.com/', [])).toBeNull();
  });
  it('Shorts は /shorts/ パスで判定', () => {
    expect(classify('https://www.youtube.com/shorts/abc123', [])).toEqual({ site: 'youtube', isShorts: true });
    expect(classify('https://m.youtube.com/shorts/abc123', [])).toEqual({ site: 'youtube', isShorts: true });
  });
  it('YouTube の通常ページ（ホーム・検索・チャンネル・watch）', () => {
    for (const u of [
      'https://www.youtube.com/',
      'https://www.youtube.com/results?search_query=a',
      'https://www.youtube.com/@someone',
      'https://www.youtube.com/watch?v=abc',
    ]) {
      expect(classify(u, [])).toEqual({ site: 'youtube', isShorts: false });
    }
  });
  it('許可した再生リストは通す（watch / playlist）', () => {
    expect(classify('https://www.youtube.com/watch?v=abc&list=PLok', ['PLok'])).toBeNull();
    expect(classify('https://www.youtube.com/playlist?list=PLok', ['PLok'])).toBeNull();
  });
  it('許可していない再生リストや、list=付きのホームは対象', () => {
    expect(classify('https://www.youtube.com/watch?v=abc&list=PLother', ['PLok'])).toEqual({
      site: 'youtube',
      isShorts: false,
    });
    expect(classify('https://www.youtube.com/?list=PLok', ['PLok'])).not.toBeNull();
  });
  it('X / Twitter / Instagram', () => {
    expect(classify('https://x.com/home', [])).toEqual({ site: 'x', isShorts: false });
    expect(classify('https://twitter.com/home', [])).toEqual({ site: 'x', isShorts: false });
    expect(classify('https://mobile.twitter.com/a', [])).toEqual({ site: 'x', isShorts: false });
    expect(classify('https://www.instagram.com/', [])).toEqual({ site: 'instagram', isShorts: false });
  });
  it('TikTok（tiktok.com と、www・m などのサブドメイン）', () => {
    expect(classify('https://www.tiktok.com/@someone/video/123', [])).toEqual({ site: 'tiktok', isShorts: false });
    expect(classify('https://tiktok.com/foryou', [])).toEqual({ site: 'tiktok', isShorts: false });
    expect(classify('https://m.tiktok.com/', [])).toEqual({ site: 'tiktok', isShorts: false });
    expect(classify('https://nottiktok.com/', [])).toBeNull();
  });
  it('無関係なホストや紛らわしいホストは対象外', () => {
    expect(classify('https://netflix.com/', [])).toBeNull();
    expect(classify('https://notyoutube.com/', [])).toBeNull();
    expect(classify('https://example.com/?u=youtube.com', [])).toBeNull();
    expect(classify('chrome://extensions', [])).toBeNull();
    expect(classify('not a url', [])).toBeNull();
  });
});

describe('normalizePlaylistId', () => {
  it('URL からも ID からも取り出せる', () => {
    expect(normalizePlaylistId('https://www.youtube.com/playlist?list=PLabc')).toBe('PLabc');
    expect(normalizePlaylistId('  PLabc ')).toBe('PLabc');
    expect(normalizePlaylistId('')).toBe('');
  });
});

describe('shouldBlock', () => {
  const shorts: Target = { site: 'youtube', isShorts: true };
  const video: Target = { site: 'youtube', isShorts: false };
  const x: Target = { site: 'x', isShorts: false };
  const ig: Target = { site: 'instagram', isShorts: false };

  it('none / prepare は制限しない', () => {
    for (const t of [shorts, video, x, ig]) {
      expect(shouldBlock('none', t, none, NOW)).toBe(false);
      expect(shouldBlock('prepare', t, none, NOW)).toBe(false);
    }
  });
  it('soft は Shorts・X・Instagram だけ', () => {
    expect(shouldBlock('soft', shorts, none, NOW)).toBe(true);
    expect(shouldBlock('soft', x, none, NOW)).toBe(true);
    expect(shouldBlock('soft', ig, none, NOW)).toBe(true);
    expect(shouldBlock('soft', video, none, NOW)).toBe(false);
  });
  it('hard は YouTube 全体も', () => {
    expect(shouldBlock('hard', video, none, NOW)).toBe(true);
    expect(shouldBlock('hard', shorts, none, NOW)).toBe(true);
  });
  it('TikTok は Level 1（soft）から制限される。YouTube の通常動画とは違い、soft で制限する', () => {
    const tiktok: Target = { site: 'tiktok', isShorts: false };
    expect(shouldBlock('none', tiktok, none, NOW)).toBe(false);
    expect(shouldBlock('prepare', tiktok, none, NOW)).toBe(false);
    expect(shouldBlock('soft', tiktok, none, NOW)).toBe(true);
    expect(shouldBlock('hard', tiktok, none, NOW)).toBe(true);
  });
  it('TikTok の解除は、TikTok だけ（ほかのサイトは開かない）', () => {
    const tiktok: Target = { site: 'tiktok', isShorts: false };
    const unlocks = { tiktok: NOW + 1000 };
    expect(shouldBlock('hard', tiktok, unlocks, NOW)).toBe(false);
    expect(shouldBlock('hard', x, unlocks, NOW)).toBe(true);
    expect(shouldBlock('hard', ig, unlocks, NOW)).toBe(true);
    expect(shouldBlock('hard', { site: 'youtube', isShorts: true }, unlocks, NOW)).toBe(true);
  });
  it('解除はサイト別：YouTube を解除しても X・Instagram は通らない', () => {
    const unlocks = { youtube: NOW + 1000 };
    expect(shouldBlock('hard', video, unlocks, NOW)).toBe(false);
    expect(shouldBlock('hard', shorts, unlocks, NOW)).toBe(false);
    expect(shouldBlock('hard', x, unlocks, NOW)).toBe(true);
    expect(shouldBlock('hard', ig, unlocks, NOW)).toBe(true);
  });
  it('解除期限が切れたら再び制限する', () => {
    expect(shouldBlock('hard', video, { youtube: NOW }, NOW)).toBe(true);
    expect(shouldBlock('hard', video, { youtube: NOW - 1 }, NOW)).toBe(true);
    expect(shouldBlock('hard', video, { youtube: NOW + 1 }, NOW)).toBe(false);
  });
});
