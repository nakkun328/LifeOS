import { addLog, listLogs } from '@/server/handlers/logs';
import { api, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';
export const GET = api((ctx, req) => listLogs(ctx, Number(new URL(req.url).searchParams.get('days') ?? 30)));
export const POST = api(async (ctx, req) => addLog(ctx, await readJson(req)));
