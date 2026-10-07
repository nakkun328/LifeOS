import { listDecisions } from '@/server/handlers/logs';
import { api } from '@/server/http';

export const dynamic = 'force-dynamic';
export const GET = api((ctx, req) => {
  const url = new URL(req.url);
  return listDecisions(ctx, url.searchParams.get('q') ?? '', Number(url.searchParams.get('limit') ?? 200));
});
