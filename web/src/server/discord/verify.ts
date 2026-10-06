import { createPublicKey, verify } from 'node:crypto';

// Ed25519 の公開鍵（32バイト）を SPKI(DER) にするための固定ヘッダ
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const MAX_SKEW_SEC = 300;

/**
 * Discord の署名検証。メッセージは「timestamp + 生のボディ」。
 * タイムスタンプが古い／未来すぎるリクエストも拒否する（再送攻撃の対策）。
 */
export function verifyDiscordSignature(opts: {
  publicKeyHex: string;
  signatureHex: string | null;
  timestamp: string | null;
  rawBody: string;
  nowMs?: number;
}): boolean {
  const { publicKeyHex, signatureHex, timestamp, rawBody } = opts;
  if (!signatureHex || !timestamp) return false;
  if (!/^[0-9a-f]{64}$/i.test(publicKeyHex) || !/^[0-9a-f]{128}$/i.test(signatureHex)) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs((opts.nowMs ?? Date.now()) / 1000 - ts) > MAX_SKEW_SEC) return false;
  try {
    const key = createPublicKey({
      key: Buffer.concat([SPKI_PREFIX, Buffer.from(publicKeyHex, 'hex')]),
      format: 'der',
      type: 'spki',
    });
    return verify(null, Buffer.from(timestamp + rawBody), key, Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}
