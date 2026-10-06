import { createHash, timingSafeEqual } from 'node:crypto';

export type AuthDeps = {
  /** 拡張・ショートカット用の個人用トークン（環境変数） */
  apiToken?: string;
  /** Web 画面用：Supabase の JWT を検証してメールアドレスを返す */
  verifyJwt?: (jwt: string) => Promise<string | null>;
  ownerEmail?: string;
};

const digest = (s: string) => createHash('sha256').update(s).digest();

export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

export async function authenticate(authorization: string | null, deps: AuthDeps): Promise<boolean> {
  const m = /^Bearer\s+(.+)$/i.exec(authorization ?? '');
  if (!m) return false;
  const token = m[1]!.trim();
  if (deps.apiToken && safeEqual(token, deps.apiToken)) return true;
  if (deps.verifyJwt && deps.ownerEmail) {
    const email = await deps.verifyJwt(token).catch(() => null);
    if (email && email.toLowerCase() === deps.ownerEmail.toLowerCase()) return true;
  }
  return false;
}
