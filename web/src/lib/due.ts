import { addDays } from './jst';

const valid = (y: number, m: number, d: number): boolean => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
const key = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * 期限の入力をゆるく解釈して YYYY-MM-DD にする。解釈できなければ null。
 *  - "2026-10-09" / "2026/10/9"
 *  - "10/9" / "10月9日"（今日以降で最も近い日付）
 *  - "今日" "明日" "明後日" "あさって" / "3日後"
 */
export function parseDue(input: string, todayKey: string): string | null {
  const s = input.trim().normalize('NFKC');
  if (s === '今日') return todayKey;
  if (s === '明日') return addDays(todayKey, 1);
  if (s === '明後日' || s === 'あさって') return addDays(todayKey, 2);
  const rel = /^(\d{1,3})日後$/.exec(s);
  if (rel) return addDays(todayKey, Number(rel[1]));

  const full = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);
  if (full) {
    const [y, m, d] = [Number(full[1]), Number(full[2]), Number(full[3])];
    return valid(y, m, d) ? key(y, m, d) : null;
  }
  const md = /^(\d{1,2})(?:\/|月)(\d{1,2})日?$/.exec(s);
  if (md) {
    const [m, d] = [Number(md[1]), Number(md[2])];
    const year = Number(todayKey.slice(0, 4));
    for (const y of [year, year + 1]) {
      if (valid(y, m, d) && key(y, m, d) >= todayKey) return key(y, m, d);
    }
  }
  return null;
}
