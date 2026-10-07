import { runMorning, webhookPoster } from '@/server/motivationNotify';
import { cron } from '@/server/http';

export const dynamic = 'force-dynamic';
export const GET = cron((ctx) => runMorning(ctx, webhookPoster(process.env.DISCORD_WEBHOOK_URL)));
