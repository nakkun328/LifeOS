import { ingestSleep } from '@/server/handlers/iphone';
import { api, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';
// iPhone 専用トークンでも呼べる（ほかの API では使えない）
export const POST = api(async (ctx, req) => ingestSleep(ctx, await readJson(req)), { scope: 'iphone' });
