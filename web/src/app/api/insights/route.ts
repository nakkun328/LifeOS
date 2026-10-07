import { buildInsightsView } from '@/server/handlers/insights';
import { api } from '@/server/http';

export const dynamic = 'force-dynamic';
export const GET = api((ctx) => buildInsightsView(ctx));
