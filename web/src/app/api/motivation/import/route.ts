import { importMotivation } from '@/server/handlers/motivation';
import { api, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';
export const POST = api(async (ctx, req) => importMotivation(ctx, await readJson(req)));
