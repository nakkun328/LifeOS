import { createHash, timingSafeEqual } from 'node:crypto';

export type AuthDeps = {
  /** 拡張・ショートカット用の個人用トークン（環境変数） */
  apiToken?: string;
  /**
   * iPhone ショートカット専用のトークン（環境変数）。睡眠とアプリ利用の送信（scope 'iphone'）にだけ使える。
   * 漏れても閲覧や他の操作には使えず、これだけ作り直せば済む。短すぎるものは無効にする。
   */
  iphoneToken?: string;
  /** Web 画面用：Supabase の JWT を検証してメールアドレスを返す */
  verifyJwt?: (jwt: string) => Promise<string | null>;
  ownerEmail?: string;
};

/** 'iphone'：iPhone 用の入力 API。それ以外は 'full' */
export type Scope = 'full' | 'iphone';

export const MIN_IPHONE_TOKEN_LENGTH = 20;

const digest = (s: string) => createHash('sha256').update(s).digest();

export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

export async function authenticate(authorization: string | null, deps: AuthDeps, scope: Scope = 'full'): Promise<boolean> {
  const m = /^Bearer\s+(.+)$/i.exec(authorization ?? '');
  if (!m) return false;
  const token = m[1]!.trim();
  if (deps.apiToken && safeEqual(token, deps.apiToken)) return true;
  if (scope === 'iphone' && deps.iphoneToken && deps.iphoneToken.length >= MIN_IPHONE_TOKEN_LENGTH && safeEqual(token, deps.iphoneToken)) {
    return true;
  }
  if (deps.verifyJwt && deps.ownerEmail) {
    const email = await deps.verifyJwt(token).catch(() => null);
    if (email && email.toLowerCase() === deps.ownerEmail.toLowerCase()) return true;
  }
  return false;
}

/**
 * 定期実行（Vercel Cron など）の認証。Vercel は、環境変数 CRON_SECRET があると
 * `Authorization: Bearer <CRON_SECRET>` を付けて呼ぶ。個人用トークン（LIFEOS_API_TOKEN）でも呼べる（外部のスケジューラ用）。
 * どちらも未設定なら、誰も呼べない。
 */
export function authorizeCron(authorization: string | null, deps: { cronSecret?: string; apiToken?: string }): boolean {
  const m = /^Bearer\s+(.+)$/i.exec(authorization ?? '');
  if (!m) return false;
  const token = m[1]!.trim();
  if (deps.cronSecret && safeEqual(token, deps.cronSecret)) return true;
  return !!deps.apiToken && safeEqual(token, deps.apiToken);
}
