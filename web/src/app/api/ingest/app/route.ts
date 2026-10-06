import { ingestApp } from '@/server/handlers/iphone';
import { api, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';
// iPhone 専用トークンでも呼べる（ほかの API では使えない）
export const POST = api(async (ctx, req) => ingestApp(ctx, await readJson(req)), { scope: 'iphone' });
