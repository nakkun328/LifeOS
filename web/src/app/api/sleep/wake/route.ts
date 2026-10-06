import { recordWake } from '@/server/handlers/sleep';
import { api, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';
export const POST = api(async (ctx, req) => recordWake(ctx, await readJson(req)));
