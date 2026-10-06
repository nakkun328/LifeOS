import { authenticate, type AuthDeps, type Scope } from './auth';
import { createAdminClient, createSupabaseDb } from './supabaseDb';
import { loadConfig } from './config';
import { HttpError } from './errors';
import type { Ctx } from './context';

type Handler = (ctx: Ctx, req: Request, params: Record<string, string>) => Promise<unknown>;

function authDeps(): AuthDeps {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    apiToken: process.env.LIFEOS_API_TOKEN,
    iphoneToken: process.env.LIFEOS_IPHONE_TOKEN,
    ownerEmail: process.env.LIFEOS_OWNER_EMAIL,
    verifyJwt:
      url && key
        ? async (jwt) => {
            const { data } = await createAdminClient(url, key).auth.getUser(jwt);
            return data.user?.email ?? null;
          }
        : undefined,
  };
}

export function makeCtx(): Ctx {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(500, 'Supabase の環境変数が設定されていません（SETUP.md を参照）');
  return { db: createSupabaseDb(createAdminClient(url, key)), now: new Date(), config: loadConfig() };
}

export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'JSON の形式が正しくありません');
  }
}

/** 認証 → ハンドラ実行 → JSON 応答。エラーは HttpError の status で返す */
export function api(handler: Handler, opts: { scope?: Scope } = {}) {
  return async (req: Request, route?: { params?: Promise<Record<string, string>> }): Promise<Response> => {
    try {
      if (!(await authenticate(req.headers.get('authorization'), authDeps(), opts.scope ?? 'full'))) {
        return Response.json({ error: '認証が必要です' }, { status: 401 });
      }
      const params = (await route?.params) ?? {};
      return Response.json(await handler(makeCtx(), req, params));
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      console.error(e);
      return Response.json({ error: 'サーバーでエラーが起きました' }, { status: 500 });
    }
  };
}
