import { ingestApp } from '@/server/handlers/iphone';
import { api, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';
export const POST = api(async (ctx, req) => ingestApp(ctx, await readJson(req)));
