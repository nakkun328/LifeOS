import { reviewWord } from '@/server/handlers/words';
import { api, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';
export const POST = api(async (ctx, req) => reviewWord(ctx, await readJson(req)));
