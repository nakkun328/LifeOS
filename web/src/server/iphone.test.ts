import { describe, expect, it } from 'vitest';
import { POST as sleepRoute } from '@/app/api/ingest/sleep/route';
import { POST as appRoute } from '@/app/api/ingest/app/route';
import { HttpError } from './errors';
import { ingestApp, ingestSleep } from './handlers/iphone';
import { recordBed, recordWake } from './handlers/sleep';
import { buildToday } from './handlers/today';
import { at, iso, makeTestCtx } from './testing';

const rejects = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(HttpError);
  expect((e as HttpError).status).toBe(400);
};

describe('睡眠（自動）', () => {
  const ctx = () => makeTestCtx('2026-10-07T07:30:00');

  it('就寝と起床を記録する。タイムゾーンなしは JST として扱う', async () => {
    const c = ctx();
    const r = await ingestSleep(c, { sleep_at: '2026-10-07 00:20:00', wake_at: '2026-10-07T06:40:00+09:00' });
    expect(r.night_date).toBe('2026-10-06');
    expect(c.db.tables.sleep![0]).toMatchObject({ source: 'auto', sleep_at: iso('2026-10-07T00:20:00'), wake_at: iso('2026-10-07T06:40:00') });
  });

  it('同じデータが重複して届いても1件', async () => {
    const c = ctx();
    const body = { sleep_at: '2026-10-07T00:20:00+09:00', wake_at: '2026-10-07T06:40:00+09:00' };
    await ingestSleep(c, body);
    const again = await ingestSleep(c, body);
    await ingestSleep(c, body);
    expect(again.updated).toBe(false);
    expect(c.db.tables.sleep).toHaveLength(1);
  });

  it('同じ夜に値が変わって届いたら、新しい行を作らず更新する', async () => {
    const c = ctx();
    await ingestSleep(c, { sleep_at: '2026-10-07T00:20:00+09:00', wake_at: '2026-10-07T06:40:00+09:00' });
    const r = await ingestSleep(c, { sleep_at: '2026-10-07T00:10:00+09:00', wake_at: '2026-10-07T06:50:00+09:00' });
    expect(r.updated).toBe(true);
    expect(c.db.tables.sleep).toHaveLength(1);
    expect(c.db.tables.sleep![0]).toMatchObject({ sleep_at: iso('2026-10-07T00:10:00'), wake_at: iso('2026-10-07T06:50:00') });
  });

  it('別の夜は別の記録', async () => {
    const c = ctx();
    await ingestSleep(c, { sleep_at: '2026-10-06T23:40:00+09:00', wake_at: '2026-10-07T06:40:00+09:00' });
    await ingestSleep(at(c, '2026-10-08T07:30:00'), { sleep_at: '2026-10-08T00:05:00+09:00', wake_at: '2026-10-08T06:30:00+09:00' });
    expect(c.db.tables.sleep).toHaveLength(2);
  });

  it('自動データがある夜は、ボタンの記録より優先（元データは両方残る）', async () => {
    const c = makeTestCtx('2026-10-06T23:50:00');
    await recordBed(c); // ボタン 23:50
    await recordWake(at(c, '2026-10-07T06:20:00'));
    const morning = at(c, '2026-10-07T07:30:00');
    expect((await buildToday(morning)).sleep.lastNight).toMatchObject({ source: 'button' });

    await ingestSleep(morning, { sleep_at: '2026-10-07T00:12:00+09:00', wake_at: '2026-10-07T06:18:00+09:00' });
    const today = await buildToday(morning);
    expect(today.sleep.lastNight).toMatchObject({ source: 'auto', sleep_at: iso('2026-10-07T00:12:00') });
    expect(c.db.tables.sleep).toHaveLength(2);
    expect(c.db.tables.sleep!.map((r) => r.source).sort()).toEqual(['auto', 'button']);
  });

  it('不正な入力を拒否する', async () => {
    const c = ctx();
    await rejects(ingestSleep(c, {}));
    await rejects(ingestSleep(c, { sleep_at: 'x', wake_at: 'y' }));
    await rejects(ingestSleep(c, { sleep_at: '2026-10-07T06:40:00+09:00', wake_at: '2026-10-07T00:20:00+09:00' })); // 逆順
    await rejects(ingestSleep(c, { sleep_at: '2026-10-06T00:00:00+09:00', wake_at: '2026-10-07T00:00:00+09:00' })); // 長すぎる
    await rejects(ingestSleep(c, { sleep_at: '2026-10-07T23:00:00+09:00', wake_at: '2026-10-08T06:00:00+09:00' })); // 未来
  });
});

describe('アプリの利用（iPhone）', () => {
  const ev = (app: string, event: string, t: string) => ({ app, event, at: `${t}+09:00` });

  it('開く・閉じるを受け取り、アプリ名は小文字にそろう。重複は1件', async () => {
    const c = makeTestCtx('2026-10-07T01:00:00');
    await ingestApp(c, ev('TikTok', 'open', '2026-10-07T00:00:00'));
    await ingestApp(c, ev('tiktok ', 'open', '2026-10-07T00:00:00'));
    await ingestApp(c, ev('TikTok', 'close', '2026-10-07T00:10:00'));
    expect(c.db.tables.app_events).toHaveLength(2);
    expect(c.db.tables.app_events![0]!.app).toBe('tiktok');
  });

  it('まとめて送れる', async () => {
    const c = makeTestCtx('2026-10-07T01:00:00');
    const r = await ingestApp(c, { events: [ev('x', 'open', '2026-10-07T00:00:00'), ev('x', 'close', '2026-10-07T00:05:00')] });
    expect(r.accepted).toBe(2);
  });

  it('不正な入力を拒否する', async () => {
    const c = makeTestCtx('2026-10-07T01:00:00');
    await rejects(ingestApp(c, ev('x', 'tap', '2026-10-07T00:00:00')));
    await rejects(ingestApp(c, ev('', 'open', '2026-10-07T00:00:00')));
    await rejects(ingestApp(c, { app: 'x', event: 'open', at: 'いつか' }));
    await rejects(ingestApp(c, ev('x', 'open', '2026-10-08T00:00:00'))); // 未来
    await rejects(ingestApp(c, ev('x', 'open', '2026-09-01T00:00:00'))); // 古すぎる
    await rejects(ingestApp(c, { events: [] }));
  });

  it('Today の Digital に、Mac とは分けて出る。23:30 より前は数えない', async () => {
    const c = makeTestCtx('2026-10-07T08:00:00');
    await ingestApp(c, ev('Instagram', 'open', '2026-10-06T23:20:00'));
    await ingestApp(c, ev('Instagram', 'close', '2026-10-06T23:40:00')); // 窓に入るのは10分
    await ingestApp(c, ev('TikTok', 'open', '2026-10-07T00:30:00'));
    await ingestApp(c, ev('TikTok', 'close', '2026-10-07T00:45:00'));
    const t = await buildToday(c);
    expect(t.digital.iphone.byCategory).toEqual({ instagram: 10, tiktok: 15 });
    expect(t.digital.iphone.minutes).toBe(25);
    expect(t.digital.mac.minutes).toBe(0);
  });

  it('朝（窓の外）に閉じる区間も、重なる分だけ数える', async () => {
    const c = makeTestCtx('2026-10-07T08:00:00');
    await ingestApp(c, ev('x', 'open', '2026-10-07T05:50:00'));
    await ingestApp(c, ev('x', 'close', '2026-10-07T06:20:00')); // 窓は 06:00 まで → 10分
    expect((await buildToday(c)).digital.iphone.byCategory).toEqual({ x: 10 });
  });

  it('閉じた記録が届かない（対にならない）開くは数えない', async () => {
    const c = makeTestCtx('2026-10-07T08:00:00');
    await ingestApp(c, ev('x', 'open', '2026-10-07T00:00:00'));
    expect((await buildToday(c)).digital.iphone.minutes).toBe(0);
  });
});

describe('認証エラー（API ルート）', () => {
  const call = (route: (r: Request) => Promise<Response>, auth?: string) =>
    route(new Request('http://x/api', { method: 'POST', body: '{}', headers: auth ? { Authorization: auth } : {} }));

  it('トークンなし・誤ったトークンは 401', async () => {
    process.env.LIFEOS_API_TOKEN = 'right-token';
    for (const route of [sleepRoute, appRoute]) {
      expect((await call(route)).status).toBe(401);
      expect((await call(route, 'Bearer wrong')).status).toBe(401);
      expect((await call(route, 'right-token')).status).toBe(401); // Bearer がない
    }
  });
});
