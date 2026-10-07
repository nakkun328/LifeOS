import { buildDigitalView } from '@/server/handlers/digitalView';
import { api } from '@/server/http';

export const dynamic = 'force-dynamic';
export const GET = api((ctx) => buildDigitalView(ctx));
