import { updateSubject } from '@/server/handlers/subjects';
import { api, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';
export const PATCH = api(async (ctx, req, params) => updateSubject(ctx, params.id!, await readJson(req)));
