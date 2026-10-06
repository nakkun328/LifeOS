import { buildToday } from '@/server/handlers/today';
import { api } from '@/server/http';

export const dynamic = 'force-dynamic';
export const GET = api((ctx) => buildToday(ctx));
