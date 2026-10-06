import { ingest } from '@/server/handlers/ingest';
import { api, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';
export const POST = api(async (ctx, req) => ingest(ctx, await readJson(req)));
