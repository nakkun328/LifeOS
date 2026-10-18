// 集中タイマー中のブロック画面（Web 側）。拡張をオフにしても、このタブは消えずに残る。
// 戻り先は、制限対象のサイトの https URL だけ（任意のURLへ飛ばさない）。

const DOMAINS = ['youtube.com', 'x.com', 'twitter.com', 'instagram.com', 'tiktok.com'];

export function safeReturnUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    const h = u.hostname.toLowerCase();
    return DOMAINS.some((d) => h === d || h.endsWith('.' + d)) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** 終了時刻（epoch ms）。数でなければ null */
export function parseUntil(raw: string | null): number | null {
  const n = Number(raw);
  return raw && Number.isFinite(n) && n > 0 ? n : null;
}
