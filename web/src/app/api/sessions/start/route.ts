import { startSession } from '@/server/handlers/sessions';
import { api, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';
export const POST = api(async (ctx, req) => startSession(ctx, await readJson(req)));
