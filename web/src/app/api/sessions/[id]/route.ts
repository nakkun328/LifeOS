import { reviewSession } from '@/server/handlers/sessions';
import { api, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';
export const PATCH = api(async (ctx, req, params) => reviewSession(ctx, params.id!, await readJson(req)));
