import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import commands from './discord/commands.json';
import { handleInteraction, PANEL_COMPONENTS, type Interaction } from './discord/handler';
import { verifyDiscordSignature } from './discord/verify';
import { createSubject } from './handlers/subjects';
import { at, makeTestCtx } from './testing';

const OWNER = '1111';
const asOwner = (i: Omit<Interaction, 'member'>): Interaction => ({ ...i, member: { user: { id: OWNER } } });
const cmd = (name: string, options: Record<string, string> = {}): Interaction =>
  asOwner({ type: 2, data: { name, options: Object.entries(options).map(([k, value]) => ({ name: k, value })) } });
const click = (custom_id: string, values?: string[]): Interaction => asOwner({ type: 3, data: { custom_id, values } });

describe('署名検証', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyHex = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
  const body = '{"type":1}';
  const nowMs = Date.UTC(2026, 9, 6, 15, 0, 0);
  const timestamp = String(nowMs / 1000);
  const signatureHex = sign(null, Buffer.from(timestamp + body), privateKey).toString('hex');
  const ok = { publicKeyHex, signatureHex, timestamp, rawBody: body, nowMs };

  it('正しい署名は通る', () => expect(verifyDiscordSignature(ok)).toBe(true));
  it('ボディの改ざんは拒否', () => expect(verifyDiscordSignature({ ...ok, rawBody: '{"type":2}' })).toBe(false));
  it('別の鍵で署名したものは拒否', () => {
    const other = generateKeyPairSync('ed25519');
    const sig = sign(null, Buffer.from(timestamp + body), other.privateKey).toString('hex');
    expect(verifyDiscordSignature({ ...ok, signatureHex: sig })).toBe(false);
  });
  it('タイムスタンプの改ざんは拒否', () => expect(verifyDiscordSignature({ ...ok, timestamp: String(nowMs / 1000 + 1) })).toBe(false));
  it('古い（再送された）リクエストは拒否', () => expect(verifyDiscordSignature({ ...ok, nowMs: nowMs + 10 * 60_000 })).toBe(false));
  it('ヘッダー欠落・形式不正・壊れた鍵は拒否', () => {
    expect(verifyDiscordSignature({ ...ok, signatureHex: null })).toBe(false);
    expect(verifyDiscordSignature({ ...ok, timestamp: null })).toBe(false);
    expect(verifyDiscordSignature({ ...ok, signatureHex: 'zz' })).toBe(false);
    expect(verifyDiscordSignature({ ...ok, publicKeyHex: 'abcd' })).toBe(false);
  });
});

describe('持ち主の制限', () => {
  it('PING には PONG を返す（持ち主の確認なし）', async () => {
    expect(await handleInteraction(makeTestCtx(), { type: 1 }, OWNER)).toEqual({ type: 1 });
  });
  it('持ち主以外は何も実行できない', async () => {
    const ctx = makeTestCtx();
    const other: Interaction = { type: 2, member: { user: { id: '9999' } }, data: { name: 'log', options: [{ name: 'tag', value: '日記' }, { name: 'text', value: 'x' }] } };
    const r = await handleInteraction(ctx, other, OWNER);
    expect(r.data?.content).toContain('持ち主だけ');
    expect(ctx.db.tables.logs ?? []).toHaveLength(0);
  });
  it('DM（member なし・user のみ）でも持ち主なら使える。持ち主が未設定なら全部断る', async () => {
    const ctx = makeTestCtx();
    const dm: Interaction = { type: 2, user: { id: OWNER }, data: { name: 'today' } };
    expect((await handleInteraction(ctx, dm, OWNER)).data?.content).toContain('Today');
    expect((await handleInteraction(ctx, dm, undefined)).data?.content).toContain('DISCORD_OWNER_ID');
  });
});

describe('コマンド', () => {
  it('/log：一言ログを残す', async () => {
    const ctx = makeTestCtx('2026-10-06T21:00:00');
    const r = await handleInteraction(ctx, cmd('log', { tag: '部活', text: '決定：来週は試合' }), OWNER);
    expect(r.data?.content).toContain('[部活] 決定：来週は試合');
    expect(ctx.db.tables.logs).toHaveLength(1);
  });
  it('/log：不正なタグは 400 をメッセージにする', async () => {
    const r = await handleInteraction(makeTestCtx(), cmd('log', { tag: '仕事', text: 'a' }), OWNER);
    expect(r.data?.content).toContain('⚠️');
  });
  it('/task：期限をゆるく解釈して追加する', async () => {
    const ctx = makeTestCtx('2026-10-06T12:00:00');
    const r = await handleInteraction(ctx, cmd('task', { name: '数学レポート', due: '10/9' }), OWNER);
    expect(r.data?.content).toContain('2026-10-09');
    expect(ctx.db.tables.tasks![0]).toMatchObject({ title: '数学レポート', due_date: '2026-10-09' });
    const tomorrow = await handleInteraction(ctx, cmd('task', { name: 'b', due: '明日' }), OWNER);
    expect(tomorrow.data?.content).toContain('2026-10-07');
  });
  it('/task：読み取れない期限は追加しない', async () => {
    const ctx = makeTestCtx();
    const r = await handleInteraction(ctx, cmd('task', { name: 'a', due: 'そのうち' }), OWNER);
    expect(r.data?.content).toContain('期限を読み取れません');
    expect(ctx.db.tables.tasks ?? []).toHaveLength(0);
  });
  it('/sleep：就寝を記録。もう一度押しても1件', async () => {
    const ctx = makeTestCtx('2026-10-06T23:50:00');
    const first = await handleInteraction(ctx, cmd('sleep'), OWNER);
    expect(first.data?.content).toContain('23:50 に記録');
    expect(first.data?.content).toContain('6時間25分'); // 23:50 → 06:15
    const second = await handleInteraction(at(ctx, '2026-10-06T23:55:00'), cmd('sleep'), OWNER);
    expect(second.data?.content).toContain('すでに');
    expect(ctx.db.tables.sleep).toHaveLength(1);
  });
  it('/today と /week：まとめが読める', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    await handleInteraction(ctx, cmd('task', { name: '英語', due: '10/10' }), OWNER);
    await handleInteraction(ctx, cmd('log', { tag: '日記', text: '晴れ' }), OWNER);
    const today = (await handleInteraction(ctx, cmd('today'), OWNER)).data?.content ?? '';
    expect(today).toContain('英語');
    expect(today).toContain('あと3日');
    expect(today).toContain('[日記] 晴れ');
    const week = (await handleInteraction(ctx, cmd('week'), OWNER)).data?.content ?? '';
    expect(week).toContain('今週');
    expect(week).toContain('10/5(月)');
  });
  it('/panel：ボタンを出す（公開メッセージ。1行5個まで）', async () => {
    const r = await handleInteraction(makeTestCtx(), cmd('panel'), OWNER);
    expect(r.data?.flags).toBeUndefined();
    expect(r.data?.components).toBe(PANEL_COMPONENTS);
    for (const row of PANEL_COMPONENTS) expect(row.components.length).toBeLessThanOrEqual(5);
  });
  it('知らないコマンドは何もしない', async () => {
    expect((await handleInteraction(makeTestCtx(), cmd('nope'), OWNER)).data?.content).toContain('知らない');
  });
});

describe('ボタンとセレクト：勉強の開始・終了', () => {
  it('勉強開始 → 科目を選ぶ → 終了', async () => {
    const ctx = makeTestCtx('2026-10-06T10:00:00');
    const math = await createSubject(ctx, { name: '数学' });
    await createSubject(ctx, { name: '英語' });

    const menu = await handleInteraction(ctx, click('panel:study'), OWNER);
    const select = (menu.data?.components as Array<{ components: Array<{ options: Array<{ label: string; value: string }> }> }>)[0]!.components[0]!;
    expect(select.options.map((o) => o.label)).toEqual(['数学', '英語']);

    const started = await handleInteraction(ctx, click('study:pick', [math.id]), OWNER);
    expect(started.data?.content).toContain('数学 を始めました');

    const dup = await handleInteraction(ctx, click('study:pick', [math.id]), OWNER);
    expect(dup.data?.content).toContain('⚠️'); // 同時に動かせるのは1つ

    const stopped = await handleInteraction(at(ctx, '2026-10-06T11:30:00'), click('panel:stop'), OWNER);
    expect(stopped.data?.content).toContain('数学 1時間30分');
    expect((await handleInteraction(ctx, click('panel:stop'), OWNER)).data?.content).toContain('⚠️');
  });
  it('科目がなければ案内する', async () => {
    expect((await handleInteraction(makeTestCtx(), click('panel:study'), OWNER)).data?.content).toContain('科目がまだありません');
  });
  it('部活：開始 → 終了', async () => {
    const ctx = makeTestCtx('2026-10-06T16:00:00');
    expect((await handleInteraction(ctx, click('panel:club'), OWNER)).data?.content).toContain('部活を始めました');
    const r = await handleInteraction(at(ctx, '2026-10-06T18:00:00'), click('panel:stop'), OWNER);
    expect(r.data?.content).toContain('部活 2時間0分');
  });
  it('寝る → 起きた：睡眠時間を返す', async () => {
    const ctx = makeTestCtx('2026-10-06T23:30:00');
    await handleInteraction(ctx, click('panel:bed'), OWNER);
    const r = await handleInteraction(at(ctx, '2026-10-07T06:40:00'), click('panel:wake'), OWNER);
    expect(r.data?.content).toContain('睡眠 7時間10分');
    expect((await handleInteraction(ctx, click('panel:wake'), OWNER)).data?.content).toContain('⚠️');
  });
  it('パネルの今日・今週ボタン、未知のボタン', async () => {
    const ctx = makeTestCtx();
    expect((await handleInteraction(ctx, click('panel:today'), OWNER)).data?.content).toContain('Today');
    expect((await handleInteraction(ctx, click('panel:week'), OWNER)).data?.content).toContain('今週');
    expect((await handleInteraction(ctx, click('panel:unknown'), OWNER)).data?.content).toContain('知らない');
  });
});

describe('コマンド定義', () => {
  it('ハンドラが処理するコマンドと一致している', () => {
    expect(commands.map((c) => c.name).sort()).toEqual(['decision', 'log', 'panel', 'sleep', 'task', 'tasks', 'today', 'week']);
    for (const c of commands) expect(c.description.length).toBeLessThanOrEqual(100);
  });
  it('ランダムな id でも壊れない', async () => {
    expect((await handleInteraction(makeTestCtx(), click('study:pick', [randomUUID()]), OWNER)).data?.content).toContain('⚠️');
  });
});
