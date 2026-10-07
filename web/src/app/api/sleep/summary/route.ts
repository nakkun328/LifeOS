import { buildSleepView } from '@/server/handlers/sleepView';
import { api } from '@/server/http';

export const dynamic = 'force-dynamic';
export const GET = api((ctx) => buildSleepView(ctx));
