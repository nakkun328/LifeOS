import { createSubject, listSubjects } from '@/server/handlers/subjects';
import { api, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';
export const GET = api((ctx) => listSubjects(ctx));
export const POST = api(async (ctx, req) => createSubject(ctx, await readJson(req)));
