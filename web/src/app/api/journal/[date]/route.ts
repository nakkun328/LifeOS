import { getJournal, resetJournal, saveJournal } from '@/server/handlers/journal';
import { api, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';
/** date は YYYY-MM-DD、または today */
export const GET = api((ctx, _req, params) => getJournal(ctx, params.date === 'today' ? null : params.date));
export const PUT = api(async (ctx, req, params) => saveJournal(ctx, params.date!, await readJson(req)));
/** 編集を取り消して、データから作り直す */
export const DELETE = api((ctx, _req, params) => resetJournal(ctx, params.date!));
