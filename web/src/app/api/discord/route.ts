import { makeCtx } from '@/server/http';
import { handleInteraction, type Interaction } from '@/server/discord/handler';
import { verifyDiscordSignature } from '@/server/discord/verify';

export const dynamic = 'force-dynamic';

/** Discord の Interactions Endpoint。認証は Bearer ではなく Ed25519 署名 */
export async function POST(req: Request): Promise<Response> {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  const rawBody = await req.text();
  const ok =
    !!publicKey &&
    verifyDiscordSignature({
      publicKeyHex: publicKey,
      signatureHex: req.headers.get('x-signature-ed25519'),
      timestamp: req.headers.get('x-signature-timestamp'),
      rawBody,
    });
  if (!ok) return new Response('invalid request signature', { status: 401 });

  let interaction: Interaction;
  try {
    interaction = JSON.parse(rawBody) as Interaction;
  } catch {
    return new Response('bad request', { status: 400 });
  }
  // PING は DB なしで返す（Endpoint URL の保存時の確認）
  if (interaction.type === 1) return Response.json({ type: 1 });
  try {
    return Response.json(await handleInteraction(makeCtx(), interaction, process.env.DISCORD_OWNER_ID));
  } catch (e) {
    console.error(e);
    return Response.json({ type: 4, data: { content: '⚠️ サーバーの設定を確認してください。', flags: 64 } });
  }
}
