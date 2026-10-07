import { describe, expect, it } from 'vitest';
import { removeSent, upsertItem, type OutboxItem } from './outbox';
import { addToBuckets, classifyUsage, countableGap, pickCategory, pruneBuckets, splitIntoMinutes } from './usage';

describe('classifyUsage', () => {
  const allowed = ['PLok'];
  it.each([
    ['https://www.youtube.com/watch?v=a', 'youtube'],
    ['https://www.youtube.com/', 'youtube'],
    ['https://www.youtube.com/shorts/abc', 'youtube_shorts'],
    ['https://music.youtube.com/watch?v=a', 'youtube_music'],
    ['https://www.youtube.com/watch?v=a&list=PLok', 'youtube_music'],
    ['https://www.youtube.com/playlist?list=PLok', 'youtube_music'],
    ['https://www.youtube.com/watch?v=a&list=PLno', 'youtube'],
    ['https://x.com/home', 'x'],
    ['https://twitter.com/a', 'x'],
    ['https://www.instagram.com/', 'instagram'],
    ['https://www.tiktok.com/@a/video/1', 'tiktok'],
  ] as const)('%s → %s', (url, expected) => expect(classifyUsage(url, allowed)).toBe(expected));

  it('対象外は null', () => {
    for (const u of ['https://example.com/', 'https://netflix.com/', 'chrome://extensions', 'x', '']) {
      expect(classifyUsage(u, allowed)).toBeNull();
    }
  });
});

describe('splitIntoMinutes', () => {
  const m = 60_000;
  it('1分の中に収まる', () => {
    expect(splitIntoMinutes(m + 10_000, m + 30_000)).toEqual([{ minuteStart: m, ms: 20_000 }]);
  });
  it('分をまたぐと分ける', () => {
    expect(splitIntoMinutes(m + 50_000, 2 * m + 20_000)).toEqual([
      { minuteStart: m, ms: 10_000 },
      { minuteStart: 2 * m, ms: 20_000 },
    ]);
  });
  it('長い区間は分ごとに分ける。空の区間は何もしない', () => {
    expect(splitIntoMinutes(0, 3 * m)).toHaveLength(3);
    expect(splitIntoMinutes(5, 5)).toEqual([]);
  });
});

describe('バケット', () => {
  it('同じ分に足していくと伸び、1分を超えない', () => {
    const b = {};
    const base = Date.UTC(2026, 9, 6, 15, 0, 0);
    addToBuckets(b, 'x', base, base + 20_000);
    addToBuckets(b, 'x', base + 20_000, base + 50_000);
    expect(Object.values(b)).toEqual([50_000]);
    addToBuckets(b, 'x', base, base + 59_000);
    expect(Object.values(b)).toEqual([60_000]);
  });
  it('カテゴリ別に持つ。古いバケットは捨てる', () => {
    const b = {};
    const base = Date.UTC(2026, 9, 6, 15, 0, 0);
    addToBuckets(b, 'x', base, base + 10_000);
    addToBuckets(b, 'youtube_music', base, base + 10_000);
    expect(Object.keys(b)).toHaveLength(2);
    expect(Object.keys(pruneBuckets(b, base + 3 * 3600_000))).toHaveLength(0);
    expect(Object.keys(pruneBuckets(b, base + 60_000))).toHaveLength(2);
  });
});

describe('countableGap', () => {
  it('通常の間隔は数える。スリープ等の長い空白と時計の逆戻りは数えない', () => {
    expect(countableGap(0, 30_000)).toBe(30_000);
    expect(countableGap(0, 150_000)).toBe(150_000);
    expect(countableGap(0, 151_000)).toBe(0);
    expect(countableGap(10_000, 5_000)).toBe(0);
  });
});

describe('outbox', () => {
  const item = (id: string, seconds = 1): OutboxItem => ({ id, payload: { type: 'usage', seconds } });
  it('同じ id は置き換える（二重にならない）', () => {
    const q = upsertItem(upsertItem([], item('a', 10)), item('a', 30));
    expect(q).toEqual([item('a', 30)]);
  });
  it('送れた分は消える', () => {
    expect(removeSent([item('a'), item('b')], [item('a')])).toEqual([item('b')]);
  });
  it('送信中に更新された項目は残る（更新分を失わない）', () => {
    const queueNow = [item('a', 45)]; // 送信中に 30→45 に伸びた
    expect(removeSent(queueNow, [item('a', 30)])).toEqual([item('a', 45)]);
  });
  it('上限を超えたら古いものから捨てる', () => {
    let q: OutboxItem[] = [];
    for (let i = 0; i < 5002; i++) q = upsertItem(q, item(`i${i}`));
    expect(q).toHaveLength(5000);
    expect(q[0]!.id).toBe('i2');
  });
});
