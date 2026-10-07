import { getReviewQueue } from '@/server/handlers/words';
import { api } from '@/server/http';

export const dynamic = 'force-dynamic';
export const GET = api((ctx, req) => getReviewQueue(ctx, Number(new URL(req.url).searchParams.get('limit') ?? 30)));
