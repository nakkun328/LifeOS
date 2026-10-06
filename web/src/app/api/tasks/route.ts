import { createTask, listTasks } from '@/server/handlers/tasks';
import { api, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';
export const GET = api((ctx) => listTasks(ctx));
export const POST = api(async (ctx, req) => createTask(ctx, await readJson(req)));
