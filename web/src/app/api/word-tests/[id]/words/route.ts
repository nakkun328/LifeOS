import { assignWordsToTest } from '@/server/handlers/words';
import { api, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';
export const POST = api(async (ctx, req, params) => assignWordsToTest(ctx, params.id!, await readJson(req)));
