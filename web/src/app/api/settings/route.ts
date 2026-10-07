import { getSettingsView, updateAppSettings } from '@/server/handlers/settings';
import { api, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';
export const GET = api((ctx) => getSettingsView(ctx));
// Sleep と Night Guard の設定は、制限中（Level 1・2）はここで拒否する
export const PUT = api(async (ctx, req) => updateAppSettings(ctx, await readJson(req)));
