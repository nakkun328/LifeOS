import { createWishItem, listWishlist } from '@/server/handlers/wishlist';
import { api, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';
export const GET = api((ctx) => listWishlist(ctx));
export const POST = api(async (ctx, req) => createWishItem(ctx, await readJson(req)));
