import { describe, expect, it } from 'vitest';
import { parseUntil, safeReturnUrl } from './focusBlocked';

describe('focusBlocked', () => {
  it('制限対象サイトの https だけ戻り先にする', () => {
    expect(safeReturnUrl('https://www.youtube.com/watch?v=a')).toBe('https://www.youtube.com/watch?v=a');
    expect(safeReturnUrl('https://x.com/home')).not.toBeNull();
  });
  it('それ以外（他のサイト・http・javascript:・空）は null', () => {
    for (const u of ['https://evil.example/', 'http://youtube.com/', 'javascript:alert(1)', 'https://notyoutube.com/', '', null]) {
      expect(safeReturnUrl(u)).toBeNull();
    }
  });
  it('終了時刻は正の数だけ', () => {
    expect(parseUntil('1700000000000')).toBe(1700000000000);
    for (const v of ['abc', '', null, '-5', '0']) expect(parseUntil(v)).toBeNull();
  });
});
