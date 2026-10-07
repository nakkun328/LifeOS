import { buildStudy } from '@/server/handlers/study';
import { api } from '@/server/http';

export const dynamic = 'force-dynamic';
export const GET = api((ctx) => buildStudy(ctx));
