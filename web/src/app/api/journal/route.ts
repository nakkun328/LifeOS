import { listJournal } from '@/server/handlers/journal';
import { api } from '@/server/http';

export const dynamic = 'force-dynamic';
export const GET = api((ctx, req) => listJournal(ctx, Number(new URL(req.url).searchParams.get('days') ?? 14)));
