import { recordBed } from '@/server/handlers/sleep';
import { api, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';
export const POST = api(async (ctx, req) => recordBed(ctx, await readJson(req)));
