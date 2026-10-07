import { addWords, getWordsSummary } from '@/server/handlers/words';
import { api, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';
export const GET = api((ctx) => getWordsSummary(ctx));
export const POST = api(async (ctx, req) => addWords(ctx, await readJson(req)));
