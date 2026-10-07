import { createWordTest, listWordTests } from '@/server/handlers/words';
import { api, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';
export const GET = api((ctx) => listWordTests(ctx));
export const POST = api(async (ctx, req) => createWordTest(ctx, await readJson(req)));
