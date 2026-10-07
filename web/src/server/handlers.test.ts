import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { authenticate } from './auth';
import { HttpError } from './errors';
import { ingest } from './handlers/ingest';
import { reviewSession, startSession, stopSession } from './handlers/sessions';
import { recordBed, recordWake } from './handlers/sleep';
import { createSubject, listSubjects, updateSubject } from './handlers/subjects';
import { buildToday } from './handlers/today';
import { at, iso, jst, makeTestCtx } from './testing';

const rejects = async (p: Promise<unknown>, status: number) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(HttpError);
  expect((e as HttpError).status).toBe(status);
};

describe('subjects', () => {
  it('追加・同名は作り直さない・名前変更・アーカイブ', async () => {
    const ctx = makeTestCtx();
    const a = await createSubject(ctx, { name: ' 数学 ' });
    expect(a.name).toBe('数学');
    expect((await createSubject(ctx, { name: '数学' })).id).toBe(a.id);
    await updateSubject(ctx, a.id, { name: '数学II' });
    expect((await listSubjects(ctx))[0]!.name).toBe('数学II');
    await updateSubject(ctx, a.id, { archived: true });
    expect(await listSubjects(ctx)).toHaveLength(0);
    await rejects(createSubject(ctx, { name: '' }), 400);
  });
});

describe('sessions', () => {
  it('START → STOP で保存される。開始時刻はDBに入る', async () => {
    const ctx = makeTestCtx('2026-10-06T10:00:00');
    const subj = await createSubject(ctx, { name: '英語' });
    const s = await startSession(ctx, { kind: 'study', subject_id: subj.id });
    expect(s.started_at).toBe(iso('2026-10-06T10:00:00'));
    expect(s.ended_at).toBeNull();
    const stopped = await stopSession(at(ctx, '2026-10-06T11:30:00'), { efficiency: 4, note: '単語' });
    expect(stopped.ended_at).toBe(iso('2026-10-06T11:30:00'));
    expect(stopped.efficiency).toBe(4);
  });

  it('同時に動かせるセッションは1つ', async () => {
    const ctx = makeTestCtx();
    const subj = await createSubject(ctx, { name: '英語' });
    await startSession(ctx, { subject_id: subj.id });
    await rejects(startSession(ctx, { subject_id: subj.id }), 409);
    await rejects(startSession(ctx, { kind: 'club' }), 409);
  });

  it('計測中でなければ STOP は 409。科目なしの勉強は 400。部活は科目なしで開始できる', async () => {
    const ctx = makeTestCtx();
    await rejects(stopSession(ctx), 409);
    await rejects(startSession(ctx, { kind: 'study' }), 400);
    const club = await startSession(ctx, { kind: 'club' });
    expect(club.kind).toBe('club');
    expect(club.subject_id).toBeNull();
  });

  it('終了後の振り返りは任意。範囲外の効率は拒否', async () => {
    const ctx = makeTestCtx();
    const subj = await createSubject(ctx, { name: '国語' });
    const s = await startSession(ctx, { subject_id: subj.id });
    const stopped = await stopSession(at(ctx, '2026-10-06T13:00:00'));
    expect(stopped.efficiency).toBeNull();
    const reviewed = await reviewSession(ctx, s.id, { efficiency: 5, progress: '第3章', note: 'よかった' });
    expect(reviewed).toMatchObject({ efficiency: 5, progress: '第3章', note: 'よかった' });
    await rejects(reviewSession(ctx, s.id, { efficiency: 6 }), 400);
  });

  it('別の端末（= 別の ctx）から見ても続きが見える', async () => {
    const ctx = makeTestCtx('2026-10-06T10:00:00');
    const subj = await createSubject(ctx, { name: '理科' });
    await startSession(ctx, { subject_id: subj.id });
    const other = at(ctx, '2026-10-06T10:45:00'); // 同じDB、別の時刻
    const today = await buildToday(other);
    expect(today.active?.subject_name).toBe('理科');
    expect(today.study.todaySeconds).toBe(45 * 60);
  });

  it('3時間を超えたら long_running になる', async () => {
    const ctx = makeTestCtx('2026-10-06T10:00:00');
    const subj = await createSubject(ctx, { name: '理科' });
    await startSession(ctx, { subject_id: subj.id });
    expect((await buildToday(at(ctx, '2026-10-06T12:59:00'))).active?.long_running).toBe(false);
    expect((await buildToday(at(ctx, '2026-10-06T13:01:00'))).active?.long_running).toBe(true);
  });
});

describe('sleep', () => {
  it('寝る → 起きた。押し直しても1件のまま', async () => {
    const ctx = makeTestCtx('2026-10-06T23:50:00');
    const a = await recordBed(ctx);
    expect(a.created).toBe(true);
    const b = await recordBed(at(ctx, '2026-10-06T23:55:00'));
    expect(b.created).toBe(false);
    expect(b.sleep.id).toBe(a.sleep.id);
    const woke = await recordWake(at(ctx, '2026-10-07T06:20:00'));
    expect(woke.wake_at).toBe(iso('2026-10-07T06:20:00'));
  });

  it('就寝の記録なしの「起きた」は 409。未来の時刻は 400', async () => {
    const ctx = makeTestCtx();
    await rejects(recordWake(ctx), 409);
    await rejects(recordBed(ctx, { at: '2026-10-06T15:00:00+09:00' }), 400);
  });

  it('同じ id の再送は二重にならない', async () => {
    const ctx = makeTestCtx('2026-10-07T00:30:00');
    const id = randomUUID();
    await recordBed(ctx, { id, at: '2026-10-07T00:20:00+09:00' });
    await recordBed(ctx, { id, at: '2026-10-07T00:20:00+09:00' });
    expect(ctx.db.tables.sleep).toHaveLength(1);
  });
});

describe('ingest（拡張からの送信）', () => {
  const usage = (start: string, seconds: number, category: string) => ({ type: 'usage', start: iso(start), seconds, category });

  it('同じ内容を何度送っても二重にならず、usage は最新の値で上書きされる', async () => {
    const ctx = makeTestCtx('2026-10-07T00:30:00');
    const gid = randomUUID();
    const batch = (secs: number) => ({
      items: [
        usage('2026-10-07T00:10:00', secs, 'youtube'),
        { type: 'guard', id: gid, at: iso('2026-10-07T00:11:00'), kind: 'unlocked', site: 'youtube', reason: '調べもの' },
      ],
    });
    await ingest(ctx, batch(20));
    await ingest(ctx, batch(20));
    await ingest(ctx, batch(45)); // 同じ分のバケットが伸びた
    expect(ctx.db.tables.usage).toHaveLength(1);
    expect(ctx.db.tables.usage![0]!.seconds).toBe(45);
    expect(ctx.db.tables.guard_events).toHaveLength(1);
  });

  it('不正な行は数えて捨て、ほかは受け付ける', async () => {
    const ctx = makeTestCtx('2026-10-07T00:30:00');
    const r = await ingest(ctx, {
      items: [
        usage('2026-10-07T00:10:00', 30, 'youtube'),
        usage('2026-10-07T00:11:00', 600, 'youtube'), // 1分バケットに収まらない
        usage('2026-10-07T00:12:00', 30, 'netflix'),
        { type: 'nope' },
        'x',
      ],
    });
    expect(r).toEqual({ accepted: 1, rejected: 4 });
    await rejects(ingest(ctx, {}), 400);
  });

  it('拡張の「寝る」も同じ API で記録され、再送しても1件', async () => {
    const ctx = makeTestCtx('2026-10-06T23:55:00');
    const id = randomUUID();
    const item = { type: 'bed', id, at: iso('2026-10-06T23:50:00') };
    await ingest(ctx, { items: [item] });
    await ingest(ctx, { items: [item] });
    expect(ctx.db.tables.sleep).toHaveLength(1);
  });
});

describe('Today（昨夜の結果）', () => {
  it('拡張の計測と Night Guard の記録が昨夜の結果として出る。音楽は含まない', async () => {
    const ctx = makeTestCtx('2026-10-07T08:00:00');
    await ingest(ctx, {
      items: [
        // 23:30 より前は数えない
        { type: 'usage', start: iso('2026-10-06T23:00:00'), seconds: 60, category: 'x' },
        { type: 'usage', start: iso('2026-10-07T00:00:00'), seconds: 60, category: 'youtube_shorts' },
        { type: 'usage', start: iso('2026-10-07T00:01:00'), seconds: 60, category: 'youtube_shorts' },
        { type: 'usage', start: iso('2026-10-07T00:02:00'), seconds: 60, category: 'youtube_music' },
        { type: 'guard', id: randomUUID(), at: iso('2026-10-07T00:05:00'), kind: 'unlocked', site: 'youtube', reason: 'a' },
        { type: 'guard', id: randomUUID(), at: iso('2026-10-07T00:06:00'), kind: 'blocked', site: 'x' },
        // 前の夜の解除は数えない
        { type: 'guard', id: randomUUID(), at: iso('2026-10-06T00:05:00'), kind: 'unlocked', site: 'x', reason: 'b' },
      ],
    });
    const t = await buildToday(ctx);
    expect(t.digital.night.nightDate).toBe('2026-10-06');
    expect(t.digital.night.mac.minutes).toBe(2);
    expect(t.digital.night.mac.byCategory).toEqual({ youtube_shorts: 2 });
    expect(t.digital.night.mac.musicMinutes).toBe(1);
    expect(t.digital.night.unlocks).toBe(1);
    expect(t.digital.night.blocked).toBe(1);
  });

  it('就寝：前日との差と平日平均', async () => {
    const ctx = makeTestCtx('2026-10-07T09:00:00');
    await recordBed({ ...ctx, now: jst('2026-10-05T23:50:00') });
    await recordWake({ ...ctx, now: jst('2026-10-06T06:30:00') });
    await recordBed({ ...ctx, now: jst('2026-10-06T23:23:00') });
    const t = await buildToday(ctx);
    expect(t.sleep.diffMinutes).toBe(-27);
    expect(t.sleep.diffMessage).toBe('昨日より27分早く寝ました');
    expect(t.sleep.lastNight?.night_date).toBe('2026-10-06');
    expect(t.sleep.weekdayAvgBed).toBe('23:37'); // (23:50 + 23:23) / 2 = 23:36.5 → 四捨五入
  });

  it('今日・今週の勉強時間（0時をまたぐセッションは朝6時で区切る）', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    const subj = await createSubject(ctx, { name: '数学' });
    // 10/6(火) 23:00〜10/7(水) 01:00 = 前日の夜の2時間
    await startSession({ ...ctx, now: jst('2026-10-06T23:00:00') }, { subject_id: subj.id });
    await stopSession({ ...ctx, now: jst('2026-10-07T01:00:00') });
    // 10/7 10:00〜11:00
    await startSession({ ...ctx, now: jst('2026-10-07T10:00:00') }, { subject_id: subj.id });
    await stopSession({ ...ctx, now: jst('2026-10-07T11:00:00') });
    const t = await buildToday(ctx);
    expect(t.study.todaySeconds).toBe(3600);
    expect(t.study.weekSeconds).toBe(3 * 3600);
  });
});

describe('authenticate', () => {
  const deps = {
    apiToken: 'secret-token',
    ownerEmail: 'me@example.com',
    verifyJwt: async (jwt: string) => (jwt === 'good-jwt' ? 'ME@example.com' : jwt === 'other-jwt' ? 'x@example.com' : null),
  };
  it('個人用トークンと、持ち主の JWT だけ通る', async () => {
    expect(await authenticate('Bearer secret-token', deps)).toBe(true);
    expect(await authenticate('Bearer good-jwt', deps)).toBe(true);
  });
  it('それ以外は拒否', async () => {
    expect(await authenticate(null, deps)).toBe(false);
    expect(await authenticate('Bearer nope', deps)).toBe(false);
    expect(await authenticate('Bearer other-jwt', deps)).toBe(false);
    expect(await authenticate('secret-token', deps)).toBe(false);
    expect(await authenticate('Bearer secret-token', { ...deps, apiToken: undefined })).toBe(false);
    expect(await authenticate('Bearer ', deps)).toBe(false);
  });
});

describe('authenticate：iPhone 専用トークン', () => {
  const IPHONE = 'iphone-token-1234567890';
  const deps = { apiToken: 'secret-token', iphoneToken: IPHONE };

  it('iPhone 用の入力 API（scope iphone）では、iPhone 専用トークンも通る', async () => {
    expect(await authenticate(`Bearer ${IPHONE}`, deps, 'iphone')).toBe(true);
    expect(await authenticate('Bearer secret-token', deps, 'iphone')).toBe(true); // 通常のトークンも通る
  });
  it('それ以外の API（scope full）では、iPhone 専用トークンは通らない', async () => {
    expect(await authenticate(`Bearer ${IPHONE}`, deps)).toBe(false);
    expect(await authenticate(`Bearer ${IPHONE}`, deps, 'full')).toBe(false);
    expect(await authenticate('Bearer secret-token', deps)).toBe(true);
  });
  it('短すぎる iPhone 用トークンは無効（弱いトークンを許さない）', async () => {
    expect(await authenticate('Bearer short', { iphoneToken: 'short' }, 'iphone')).toBe(false);
    expect(await authenticate('Bearer 1234567890123456789', { iphoneToken: '1234567890123456789' }, 'iphone')).toBe(false);
    expect(await authenticate('Bearer 12345678901234567890', { iphoneToken: '12345678901234567890' }, 'iphone')).toBe(true);
  });
  it('未設定・誤ったトークンは通らない', async () => {
    expect(await authenticate(`Bearer ${IPHONE}`, { apiToken: 'secret-token' }, 'iphone')).toBe(false);
    expect(await authenticate('Bearer wrong-token-xxxxxxxxxxxx', deps, 'iphone')).toBe(false);
  });
});
