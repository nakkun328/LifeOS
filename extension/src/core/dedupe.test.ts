import { describe, expect, it } from 'vitest';
import { checkBlockDedupe } from './dedupe';

describe('checkBlockDedupe', () => {
  it('同一タブ・同一サイトは60秒以内なら1件にまとめる', () => {
    const a = checkBlockDedupe({}, '1:youtube', 0);
    expect(a.record).toBe(true);
    const b = checkBlockDedupe(a.next, '1:youtube', 59_000);
    expect(b.record).toBe(false);
    const c = checkBlockDedupe(b.next, '1:youtube', 60_000);
    expect(c.record).toBe(true);
  });
  it('別タブ・別サイトは別扱い', () => {
    const a = checkBlockDedupe({}, '1:youtube', 0);
    expect(checkBlockDedupe(a.next, '2:youtube', 1000).record).toBe(true);
    expect(checkBlockDedupe(a.next, '1:x', 1000).record).toBe(true);
  });
  it('古い記録は掃除される', () => {
    const a = checkBlockDedupe({}, '1:youtube', 0);
    const b = checkBlockDedupe(a.next, '2:x', 120_000);
    expect(Object.keys(b.next)).toEqual(['2:x']);
  });
});
