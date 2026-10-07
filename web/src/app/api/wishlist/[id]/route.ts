import { updateWishItem } from '@/server/handlers/wishlist';
import { api, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';
export const PATCH = api(async (ctx, req, params) => updateWishItem(ctx, params.id!, await readJson(req)));
