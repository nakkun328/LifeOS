import { updateTask } from '@/server/handlers/tasks';
import { api, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';
export const PATCH = api(async (ctx, req, params) => updateTask(ctx, params.id!, await readJson(req)));
