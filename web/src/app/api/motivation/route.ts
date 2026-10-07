import { listMotivation, saveMotivation } from '@/server/handlers/motivation';
import { api, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';
export const GET = api((ctx) => listMotivation(ctx));
export const POST = api(async (ctx, req) => saveMotivation(ctx, await readJson(req)));
