import { describe, expect, it } from 'vitest';
import type { MotivationRow } from '@/lib/types';
import { authorizeCron } from './auth';
import { handleInteraction, type Interaction } from './discord/handler';
import { HttpError } from './errors';
import { getMotivationOn, importMotivation, listMotivation, saveMotivation, setMotivationItem } from './handlers/motivation';
import { buildToday } from './handlers/today';
import { eveningMessage, morningMessage, runEvening, runMorning, webhookPoster } from './motivationNotify';
import { at, makeTestCtx } from './testing';

type Ctx = ReturnType<typeof makeTestCtx>;
const status = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(HttpError);
  return (e as HttpError).status;
};
const rows = (ctx: Ctx) => (ctx.db.tables.motivation_records ?? []) as unknown as MotivationRow[];
const ALL = { phys: 7, photo: 5, video: 6, baseball: 8, prospi: 4, game: 5 };

describe('Motivation：記録', () => {
  it('6項目を記録でき、同じ日に記録し直すと上書きされる（1日1件）', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    await saveMotivation(ctx, { scores: ALL, comment: '良い日' });
    await saveMotivation(ctx, { scores: { ...ALL, phys: 9 }, comment: '' });
    expect(rows(ctx)).toHaveLength(1);
    expect(rows(ctx)[0]).toMatchObject({ record_date: '2026-10-07', scores: { ...ALL, phys: 9 }, comment: null });
  });

  it('欠けた項目は欠けのまま保存する（5 などで埋めない）', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    await saveMotivation(ctx, { scores: { phys: 7 } });
    expect(rows(ctx)[0]!.scores).toEqual({ phys: 7 });
  });

  it('不正な入力を断る', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    expect(await status(saveMotivation(ctx, {}))).toBe(400);
    expect(await status(saveMotivation(ctx, { scores: {} }))).toBe(400);
    expect(await status(saveMotivation(ctx, { scores: { phys: 11 } }))).toBe(400);
    expect(await status(saveMotivation(ctx, { scores: { phys: 0 } }))).toBe(400);
    expect(await status(saveMotivation(ctx, { scores: { phys: 5.5 } }))).toBe(400);
    expect(await status(saveMotivation(ctx, { scores: { music: 5 } }))).toBe(400);
    expect(await status(saveMotivation(ctx, { scores: { phys: 5 }, comment: 'あ'.repeat(501) }))).toBe(400);
    expect(rows(ctx)).toHaveLength(0);
  });

  it('日付は日本時間の朝6時で区切る：朝9時前（UTC では前日）に記録しても、その日の日付', async () => {
    const ctx = makeTestCtx('2026-10-07T08:30:00'); // 日本時間 8:30 = UTC では 10/6 23:30
    await saveMotivation(ctx, { scores: { phys: 6 } });
    expect(rows(ctx)[0]!.record_date).toBe('2026-10-07');
    // 朝6時前は、まだ前の日
    await saveMotivation(at(ctx, '2026-10-08T05:30:00'), { scores: { phys: 4 } });
    expect(rows(ctx).map((r) => r.record_date).sort()).toEqual(['2026-10-07']);
    expect(rows(ctx)[0]!.scores).toEqual({ phys: 4 });
    await saveMotivation(at(ctx, '2026-10-08T06:00:00'), { scores: { phys: 3 } });
    expect(rows(ctx).map((r) => r.record_date).sort()).toEqual(['2026-10-07', '2026-10-08']);
  });

  it('一覧は古い日が先。今日の日付も返す', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    await saveMotivation(at(ctx, '2026-10-05T12:00:00'), { scores: { phys: 1 } });
    await saveMotivation(ctx, { scores: { phys: 2 } });
    const l = await listMotivation(ctx);
    expect(l.today).toBe('2026-10-07');
    expect(l.records.map((r) => r.record_date)).toEqual(['2026-10-05', '2026-10-07']);
  });
});

describe('Motivation：1項目だけ更新（/motiv）', () => {
  it('今日の記録のその項目だけを更新し、ほかの項目とメモは消さない', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    await saveMotivation(ctx, { scores: ALL, comment: 'メモ' });
    const r = await setMotivationItem(ctx, 'game', 9);
    expect(r).toMatchObject({ key: 'game', score: 9 });
    expect(rows(ctx)).toHaveLength(1);
    expect(rows(ctx)[0]).toMatchObject({ scores: { ...ALL, game: 9 }, comment: 'メモ' });
  });
  it('今日の記録がなければ、その1項目だけで作る（ほかは欠けのまま）', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    await setMotivationItem(ctx, 'phys', 7);
    expect(rows(ctx)[0]!.scores).toEqual({ phys: 7 });
  });
  it('項目・点数を検証する', async () => {
    const ctx = makeTestCtx();
    expect(await status(setMotivationItem(ctx, 'music', 5))).toBe(400);
    expect(await status(setMotivationItem(ctx, 'phys', 11))).toBe(400);
    expect(await status(setMotivationItem(ctx, 'phys', 'x'))).toBe(400);
  });
});

describe('Discord：/motiv', () => {
  const cmd = (item: string, score: unknown): Interaction => ({ type: 2, member: { user: { id: '9' } }, data: { name: 'motiv', options: [{ name: 'item', value: item }, { name: 'score', value: score }] } });
  it('既存と同じ形の返信（8マスのバー）で、1項目だけ記録する', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    const res = await handleInteraction(ctx, cmd('phys', 7), '9');
    expect(res.data?.content).toBe('✅ 物理部関連 を 7/10 で記録したよ！\n■■■■■■□□');
    await handleInteraction(ctx, cmd('game', 3), '9');
    expect(rows(ctx)[0]!.scores).toEqual({ phys: 7, game: 3 });
  });
  it('範囲外の点数は記録しない', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    expect((await handleInteraction(ctx, cmd('phys', 11), '9')).data?.content).toContain('⚠️');
    expect(rows(ctx)).toHaveLength(0);
  });
});

describe('Today', () => {
  it('未記録は null、記録済みは今日の点数', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    expect((await buildToday(ctx)).motivation).toBeNull();
    await saveMotivation(ctx, { scores: { phys: 7 }, comment: 'メモ' });
    expect((await buildToday(ctx)).motivation).toEqual({ record_date: '2026-10-07', scores: { phys: 7 }, comment: 'メモ' });
    // 昨日の記録は、今日の分としては出さない
    expect((await buildToday(at(ctx, '2026-10-08T12:00:00'))).motivation).toBeNull();
  });
});

describe('取り込み', () => {
  const json = (v: unknown) => JSON.stringify(v);
  const old = [
    { date: '2026-10-01', scores: ALL, comment: '旧アプリ' },
    { date: '2026-10-02', scores: { phys: 3, game: 8 } },
  ];

  it('確認（dryRun）では書き込まず、件数と期間を返す', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    const r = await importMotivation(ctx, { json: json(old), dryRun: true });
    expect(r).toMatchObject({ dryRun: true, total: 2, validDates: 2, period: { from: '2026-10-01', to: '2026-10-02' }, newDates: 2, overlapDates: 0, invalidCount: 0, created: 0 });
    expect(rows(ctx)).toHaveLength(0);
  });

  it('取り込める。何度取り込んでも重複しない（べき等）', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    expect(await importMotivation(ctx, { json: json(old) })).toMatchObject({ created: 2, updated: 0 });
    expect(rows(ctx)).toHaveLength(2);
    for (const prefer of ['existing', 'incoming']) {
      expect(await importMotivation(ctx, { json: json(old), prefer })).toMatchObject({ created: 0, updated: 0, unchanged: 2, overlapDates: 2, conflicts: 0 });
    }
    expect(rows(ctx)).toHaveLength(2);
    expect(rows(ctx).find((r) => r.record_date === '2026-10-01')).toMatchObject({ scores: ALL, comment: '旧アプリ' });
  });

  it('同じ日付があれば項目ごとにマージする。同じ項目は、選んだ側を残す', async () => {
    const mk = async (prefer: string) => {
      const ctx = makeTestCtx('2026-10-07T12:00:00');
      await saveMotivation(at(ctx, '2026-10-01T12:00:00'), { scores: { phys: 2, photo: 9 }, comment: 'Life OS のメモ' });
      const dry = await importMotivation(ctx, { json: json([{ date: '2026-10-01', scores: { phys: 8, game: 4 }, comment: '旧アプリ' }]), dryRun: true });
      expect(dry).toMatchObject({ overlapDates: 1, newDates: 0, conflicts: 1 });
      await importMotivation(ctx, { json: json([{ date: '2026-10-01', scores: { phys: 8, game: 4 }, comment: '旧アプリ' }]), prefer });
      return rows(ctx)[0]!;
    };
    expect(await mk('existing')).toMatchObject({ scores: { phys: 2, photo: 9, game: 4 }, comment: 'Life OS のメモ' });
    expect(await mk('incoming')).toMatchObject({ scores: { phys: 8, photo: 9, game: 4 }, comment: '旧アプリ' });
  });

  it('不正な行は取り込まず、件数と理由を報告する。ほかの行は取り込む', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    const r = await importMotivation(ctx, {
      json: json([
        { date: '2026-10-01', scores: { phys: 11 } },
        { date: '2026-10-02', scores: { phys: 5 } },
        { date: '2026/10/03', scores: { phys: 5 } },
        { date: '2026-10-04', scores: { music: 5 } },
      ]),
    });
    expect(r).toMatchObject({ total: 4, validDates: 1, invalidCount: 3, created: 1 });
    expect(r.invalid.map((x) => x.index)).toEqual([0, 2, 3]);
    expect(rows(ctx).map((x) => x.record_date)).toEqual(['2026-10-02']);
  });

  it('読めない入力は 400', async () => {
    const ctx = makeTestCtx();
    expect(await status(importMotivation(ctx, {}))).toBe(400);
    expect(await status(importMotivation(ctx, { json: 'JSONではない' }))).toBe(400);
    expect(await status(importMotivation(ctx, { json: '{"a":1}' }))).toBe(400);
    expect(await status(importMotivation(ctx, { json: '[]', prefer: 'both' }))).toBe(400);
  });

  it('既存の記録（ほかの日）には触れない', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    await saveMotivation(ctx, { scores: { phys: 6 } });
    await importMotivation(ctx, { json: json(old) });
    expect(await getMotivationOn(ctx, '2026-10-07')).toMatchObject({ scores: { phys: 6 } });
    expect(rows(ctx)).toHaveLength(3);
  });
});

describe('通知', () => {
  const sent = () => {
    const msgs: string[] = [];
    return { msgs, post: async (c: string) => void msgs.push(c) };
  };

  it('朝8時：昨日の記録があれば、そのまとめを送る（記録のある項目だけ）', async () => {
    const ctx = makeTestCtx('2026-10-07T08:00:00');
    await saveMotivation(at(ctx, '2026-10-06T20:00:00'), { scores: { phys: 7, game: 3 }, comment: '配線が進んだ' });
    const s = sent();
    expect(await runMorning(ctx, s.post)).toEqual({ sent: true, date: '2026-10-06', recorded: true });
    expect(s.msgs).toHaveLength(1);
    expect(s.msgs[0]).toBe(['☀️ おはよう。昨日（10/6 火）のモチベ', '【開発】', '物理部関連　7/10　■■■■■■□□', '【趣味】', 'その他ゲーム　3/10　■■□□□□□□', '平均 5.0', '💬 配線が進んだ'].join('\n'));
  });

  it('朝8時：昨日の記録がなければ、その旨を送る（責めない）', async () => {
    const ctx = makeTestCtx('2026-10-07T08:00:00');
    await saveMotivation(ctx, { scores: { phys: 9 } }); // 今日の分は、昨日の分ではない
    const s = sent();
    expect(await runMorning(ctx, s.post)).toEqual({ sent: true, date: '2026-10-06', recorded: false });
    expect(s.msgs[0]).toBe(morningMessage('2026-10-06', null));
    expect(s.msgs[0]).toContain('記録がなかったよ');
    expect(s.msgs[0]).not.toMatch(/サボ|怠|なぜ|しなかった|ダメ/);
  });

  it('夜21時：今日まだ記録がなければ、催促を送る', async () => {
    const ctx = makeTestCtx('2026-10-07T21:00:00');
    await saveMotivation(at(ctx, '2026-10-06T21:00:00'), { scores: { phys: 5 } }); // 昨日の記録は関係ない
    const s = sent();
    expect(await runEvening(ctx, s.post)).toEqual({ sent: true, date: '2026-10-07' });
    expect(s.msgs).toEqual([eveningMessage()]);
    expect(eveningMessage()).not.toMatch(/サボ|怠|なぜ|しなかった|ダメ/);
  });

  it('夜21時：今日の記録が済んでいれば、送らない', async () => {
    const ctx = makeTestCtx('2026-10-07T21:00:00');
    await setMotivationItem(ctx, 'phys', 6); // 1項目だけでも、記録済み
    const s = sent();
    expect(await runEvening(ctx, s.post)).toEqual({ sent: false, date: '2026-10-07' });
    expect(s.msgs).toEqual([]);
  });

  it('Webhook：Discord の URL にだけ送る。未設定・別のURLは 503、送信失敗は 502', async () => {
    const url = 'https://discord.com/api/webhooks/123456/abc_DEF-ghi';
    const calls: Array<{ url: string; body: string }> = [];
    const ok = (async (u: string, init: { body: string }) => { calls.push({ url: u, body: init.body }); return new Response(null, { status: 204 }); }) as unknown as typeof fetch;
    await webhookPoster(url, ok)('こんにちは');
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]!.body)).toEqual({ content: 'こんにちは', allowed_mentions: { parse: [] } });
    expect(() => webhookPoster(undefined)).toThrow(HttpError);
    expect(() => webhookPoster('https://evil.example.com/api/webhooks/1/a')).toThrow(HttpError);
    expect(() => webhookPoster('http://discord.com/api/webhooks/1/a')).toThrow(HttpError);
    const ng = (async () => new Response('x', { status: 500 })) as unknown as typeof fetch;
    expect(await status(webhookPoster(url, ng)('x'))).toBe(502);
  });

  it('定期実行の認証：CRON_SECRET か 個人用トークンだけ。未設定なら誰も呼べない', () => {
    const deps = { cronSecret: 'cron-secret-value', apiToken: 'api-token' };
    expect(authorizeCron('Bearer cron-secret-value', deps)).toBe(true);
    expect(authorizeCron('Bearer api-token', deps)).toBe(true);
    expect(authorizeCron('Bearer wrong', deps)).toBe(false);
    expect(authorizeCron(null, deps)).toBe(false);
    expect(authorizeCron('Bearer anything', {})).toBe(false);
    expect(authorizeCron('Bearer ', { cronSecret: '' })).toBe(false);
  });
});
