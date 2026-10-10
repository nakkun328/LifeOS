import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_SETTINGS } from '@/lib/appSettings';
import { handleInteraction, type Interaction } from './discord/handler';
import { HttpError } from './errors';
import { ingest } from './handlers/ingest';
import { ingestApp } from './handlers/iphone';
import { addLog, listDecisions, listLogs, listTodayLogs } from './handlers/logs';
import { startSession, stopSession } from './handlers/sessions';
import { getAppSettings, getSettingsView, updateAppSettings } from './handlers/settings';
import { buildSleepView } from './handlers/sleepView';
import { buildStudy } from './handlers/study';
import { createSubject } from './handlers/subjects';
import { createTask, listTasks, updateTask } from './handlers/tasks';
import { buildToday } from './handlers/today';
import { buildDigitalView } from './handlers/digitalView';
import { recordBed, recordWake } from './handlers/sleep';
import { at, iso, jst, makeTestCtx } from './testing';

const status = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(HttpError);
  return (e as HttpError).status;
};

describe('Settings（唯一の正）', () => {
  it('保存がなければ初期値。起床予定は 06:15', async () => {
    const ctx = makeTestCtx();
    expect(await getAppSettings(ctx)).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('節ごとに保存でき、送らなかった節はそのまま残る', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    await updateAppSettings(ctx, { sleep: { wakeTime: '07:00' } });
    await updateAppSettings(ctx, { guard: { waitSeconds: 45 } });
    const s = await getAppSettings(ctx);
    expect(s.sleep.wakeTime).toBe('07:00');
    expect(s.sleep.targetBed).toBe('23:30');
    expect(s.guard.waitSeconds).toBe(45);
    expect(s.guard.level1Time).toBe('23:15');
  });

  it('不正な値は 400。保存されない', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    expect(await status(updateAppSettings(ctx, { guard: { level1Time: '23:45' } }))).toBe(400); // Level 2 より後
    expect(await status(updateAppSettings(ctx, { sleep: { wakeTime: '25:00' } }))).toBe(400);
    expect(await status(updateAppSettings(ctx, { guard: { waitSeconds: -5 } }))).toBe(400);
    expect(await getAppSettings(ctx)).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('再生リストは URL でも ID でも保存でき、重複は1つにまとまる', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    await updateAppSettings(ctx, { guard: { allowedPlaylists: ['https://www.youtube.com/playlist?list=PLabc', 'PLabc', ' PLxyz '] } });
    expect((await getAppSettings(ctx)).guard.allowedPlaylists).toEqual(['PLabc', 'PLxyz']);
  });

  it('制限中（Level 1・2）は、Sleep と Night Guard の設定を API が拒否する（403）', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    for (const t of ['2026-10-07T23:20:00', '2026-10-08T00:30:00']) {
      const night = at(ctx, t); // 23:15 以降（Level 1）、23:30 以降（Level 2）
      expect((await getSettingsView(night)).locked).toBe(true);
      expect(await status(updateAppSettings(night, { sleep: { wakeTime: '09:00' } }))).toBe(403);
      expect(await status(updateAppSettings(night, { guard: { level1Time: '23:55', level2Time: '23:59' } }))).toBe(403);
      expect(await status(updateAppSettings(night, { guard: { allowedPlaylists: ['PLnew'] } }))).toBe(403);
    }
    const s = await getAppSettings(ctx);
    expect(s.sleep.wakeTime).toBe('06:15');
    expect(s.guard.level1Time).toBe('23:15');
  });

  it('制限中でも、Night Guard に関係しない設定（Digital）は変更できる。値が変わらない送信も通る', async () => {
    const ctx = at(makeTestCtx('2026-10-07T12:00:00'), '2026-10-07T23:20:00');
    await updateAppSettings(ctx, { digital: { reduce: ['tiktok', 'x'] } });
    expect((await getAppSettings(ctx)).digital.reduce).toEqual(['tiktok', 'x']);
    // 画面は全項目を送る。Sleep・Guard が今の値のままなら、制限中でも通る
    const cur = await getAppSettings(ctx);
    await updateAppSettings(ctx, { sleep: cur.sleep, guard: cur.guard, digital: { exclude: ['youtube_music', 'x'] } });
    expect((await getAppSettings(ctx)).digital.exclude).toEqual(['youtube_music', 'x']);
  });

  it('制限中かどうかは、保存済みの設定で判定する（送った値で時刻をずらして回避できない）', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    const night = at(ctx, '2026-10-07T23:20:00'); // 保存済みでは Level 1 の最中
    // Level 1 を 23:59 にして「いまは制限中ではない」ことにする送信
    expect(await status(updateAppSettings(night, { guard: { level1Time: '23:58', level2Time: '23:59' } }))).toBe(403);
  });

  it('制限が終わった朝は、変更できる', async () => {
    const ctx = makeTestCtx('2026-10-08T06:00:00');
    expect((await getSettingsView(ctx)).locked).toBe(false);
    await updateAppSettings(ctx, { sleep: { wakeTime: '06:45' } });
    expect((await getAppSettings(ctx)).sleep.wakeTime).toBe('06:45');
  });

  it('設定を変えると、保存した時刻が使われる（Level の時刻を変えれば制限の判定も変わる）', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    expect((await getSettingsView(at(ctx, '2026-10-07T23:20:00'))).stage).toBe('soft');
    await updateAppSettings(ctx, { guard: { prepareTime: '23:30', level1Time: '23:45', level2Time: '23:59' } });
    expect((await getSettingsView(at(ctx, '2026-10-07T23:20:00'))).stage).toBe('none');
  });
});

describe('起床時刻は Settings が唯一の正（Web と Discord の「今寝れば」）', () => {
  it('Today の起床予定が、Settings の値になる', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    expect((await buildToday(ctx)).wakeTime).toBe('06:15');
    await updateAppSettings(ctx, { sleep: { wakeTime: '07:30' } });
    expect((await buildToday(ctx)).wakeTime).toBe('07:30');
  });

  it('Discord の /sleep の「今寝れば◯時間」も、Settings の値で計算する', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    await updateAppSettings(ctx, { sleep: { wakeTime: '07:00' } });
    const night = at(ctx, '2026-10-07T23:00:00');
    const i: Interaction = { type: 2, member: { user: { id: '1' } }, data: { name: 'sleep' } };
    const r = await handleInteraction(night, i, '1');
    expect(r.data?.content).toContain('8時間0分'); // 23:00 → 07:00
  });
});

describe('Tasks：追加項目は任意', () => {
  it('課題名と期限だけで登録できる。追加項目は空のまま', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    const t = await createTask(ctx, { title: '数学レポート', due_date: '2026-10-10' });
    expect(t.category ?? null).toBeNull();
    expect(t.priority ?? null).toBeNull();
    expect(t.memo ?? null).toBeNull();
    expect((await listTasks(ctx))[0]).toMatchObject({ title: '数学レポート', days_left: 3, subject_name: null });
  });

  it('科目・カテゴリ・優先度・メモを入れても保存される', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    const subj = await createSubject(ctx, { name: '数学' });
    const t = await createTask(ctx, { title: 'レポート', due_date: '2026-10-10', subject_id: subj.id, category: 'school', priority: 1, memo: '第3章まで' });
    expect(t).toMatchObject({ subject_id: subj.id, category: 'school', priority: 1, memo: '第3章まで' });
    expect((await listTasks(ctx))[0]).toMatchObject({ subject_name: '数学', category: 'school', priority: 1 });
  });

  it('空の追加項目（空文字・null）は「なし」として登録できる', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    const t = await createTask(ctx, { title: 'a', due_date: '2026-10-10', subject_id: '', category: '', priority: null, memo: '' });
    expect(t.category ?? null).toBeNull();
    expect(t.memo ?? null).toBeNull();
  });

  it('入力された追加項目は検証する', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    const base = { title: 'a', due_date: '2026-10-10' };
    expect(await status(createTask(ctx, { ...base, category: 'work' }))).toBe(400);
    expect(await status(createTask(ctx, { ...base, priority: 5 }))).toBe(400);
    expect(await status(createTask(ctx, { ...base, subject_id: 'x' }))).toBe(400);
    expect(await status(createTask(ctx, { ...base, subject_id: randomUUID() }))).toBe(404);
  });

  it('後から追加項目を足せる。進捗の変更は追加項目を消さない', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    const t = await createTask(ctx, { title: 'a', due_date: '2026-10-10' });
    await updateTask(ctx, t.id, { category: 'club', priority: 2 });
    await updateTask(ctx, t.id, { status: 'doing' });
    expect((await listTasks(ctx))[0]).toMatchObject({ category: 'club', priority: 2, status: 'doing' });
  });

  it('同じ期限なら、優先度の高いものが先。期限切れは負の残り日数で出る', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    await createTask(ctx, { title: '低', due_date: '2026-10-10', priority: 3 });
    await createTask(ctx, { title: '高', due_date: '2026-10-10', priority: 1 });
    await createTask(ctx, { title: '未設定', due_date: '2026-10-10' });
    await createTask(ctx, { title: '遅れ', due_date: '2026-10-05' });
    const list = await listTasks(ctx);
    expect(list.map((x) => x.title)).toEqual(['遅れ', '高', '低', '未設定']);
    expect(list[0]!.days_left).toBe(-2);
  });
});

describe('決定事項', () => {
  it('同じ入力欄（種別で切り替え）で、件名つき・件名なしの決定事項を残せる。タグは部活になる', async () => {
    const ctx = makeTestCtx('2026-10-07T20:00:00');
    const a = await addLog(ctx, { kind: 'decision', title: '文化祭2027', body: '展示のPC更新は保留。工具更新を優先' });
    expect(a).toMatchObject({ kind: 'decision', title: '文化祭2027', tag: '部活' });
    const b = await addLog(ctx, { kind: 'decision', body: '次回の定例は来週火曜' });
    expect(b.title ?? null).toBeNull();
  });

  it('通常のログと区別される（一言ログの一覧・今日のログに決定事項は出ない）', async () => {
    const ctx = makeTestCtx('2026-10-07T20:00:00');
    await addLog(ctx, { tag: '日記', body: '晴れ' });
    await addLog(ctx, { kind: 'decision', body: '決まったこと' });
    expect((await listLogs(ctx)).map((l) => l.body)).toEqual(['晴れ']);
    expect((await listTodayLogs(ctx)).map((l) => l.body)).toEqual(['晴れ']);
    expect((await listDecisions(ctx)).map((l) => l.body)).toEqual(['決まったこと']);
  });

  it('キーワードで検索できる（件名・本文、大文字小文字・全角半角を区別しない、複数語はすべて含む）', async () => {
    const ctx = makeTestCtx('2026-10-07T20:00:00');
    await addLog(ctx, { kind: 'decision', title: '文化祭2027', body: '展示のPC更新は保留。工具更新を優先' });
    await addLog(at(ctx, '2026-10-08T20:00:00'), { kind: 'decision', title: '部費', body: 'Arduino を追加購入する' });
    await addLog(at(ctx, '2026-10-09T20:00:00'), { kind: 'decision', body: '練習は週2回' });
    expect((await listDecisions(ctx, '文化祭')).map((l) => l.title)).toEqual(['文化祭2027']);
    expect((await listDecisions(ctx, '工具')).length).toBe(1);
    expect((await listDecisions(ctx, 'arduino')).map((l) => l.title)).toEqual(['部費']); // 小文字でも
    expect((await listDecisions(ctx, '２０２７')).length).toBe(1); // 全角でも
    expect((await listDecisions(ctx, '展示 工具')).length).toBe(1);
    expect((await listDecisions(ctx, '展示 Arduino')).length).toBe(0);
    expect((await listDecisions(ctx, '存在しない'))).toEqual([]);
    expect((await listDecisions(ctx, '')).map((l) => l.body)[0]).toBe('練習は週2回'); // 新しい順
  });

  it('不正な入力を拒否する', async () => {
    const ctx = makeTestCtx('2026-10-07T20:00:00');
    expect(await status(addLog(ctx, { kind: 'decision', body: '' }))).toBe(400);
    expect(await status(addLog(ctx, { kind: 'decision', body: 'あ'.repeat(501) }))).toBe(400);
    expect(await status(addLog(ctx, { kind: 'decision', body: 'a', title: 'あ'.repeat(61) }))).toBe(400);
    expect(await status(addLog(ctx, { kind: 'memo', body: 'a', tag: '日記' }))).toBe(400);
    expect(await status(addLog(ctx, { tag: '仕事', body: 'a' }))).toBe(400);
  });

  it('既存のログ（種別のない行）は、通常のログとして読める', async () => {
    const ctx = makeTestCtx('2026-10-07T20:00:00');
    await ctx.db.insert('logs', { body: '昔のログ', tag: '趣味', log_date: '2026-10-07', created_at: iso('2026-10-07T10:00:00') });
    expect((await listLogs(ctx)).map((l) => l.body)).toEqual(['昔のログ']);
    expect(await listDecisions(ctx)).toEqual([]);
  });
});

describe('Discord：/decision と /tasks', () => {
  const OWNER = '9';
  const cmd = (name: string, opts: Record<string, string> = {}): Interaction => ({
    type: 2,
    member: { user: { id: OWNER } },
    data: { name, options: Object.entries(opts).map(([k, value]) => ({ name: k, value })) },
  });

  it('/decision で決定事項を残せる（件名は任意）', async () => {
    const ctx = makeTestCtx('2026-10-07T20:00:00');
    const r = await handleInteraction(ctx, cmd('decision', { text: '工具更新を優先', title: '文化祭2027' }), OWNER);
    expect(r.data?.content).toContain('決定事項を残しました');
    expect(r.data?.content).toContain('文化祭2027');
    await handleInteraction(ctx, cmd('decision', { text: '次回は来週' }), OWNER);
    expect((await listDecisions(ctx)).length).toBe(2);
  });

  it('/tasks で、期限が近い課題を一覧できる（完了は出ない。カテゴリ・科目も出る）', async () => {
    const ctx = makeTestCtx('2026-10-07T12:00:00');
    const subj = await createSubject(ctx, { name: '数学' });
    await createTask(ctx, { title: '数学レポート', due_date: '2026-10-10', subject_id: subj.id, category: 'school' });
    await createTask(ctx, { title: '部誌の原稿', due_date: '2026-10-12', category: 'club' });
    const done = await createTask(ctx, { title: '終わったもの', due_date: '2026-10-08' });
    await updateTask(ctx, done.id, { status: 'done' });
    const text = (await handleInteraction(ctx, cmd('tasks'), OWNER)).data?.content ?? '';
    expect(text).toContain('数学レポート');
    expect(text).toContain('あと3日');
    expect(text).toContain('学校・数学');
    expect(text).toContain('部誌の原稿');
    expect(text).not.toContain('終わったもの');
    expect(text.indexOf('数学レポート')).toBeLessThan(text.indexOf('部誌の原稿'));
  });

  it('課題がないときの案内', async () => {
    const r = await handleInteraction(makeTestCtx(), cmd('tasks'), OWNER);
    expect(r.data?.content).toContain('期限が近い課題はありません');
  });
});

describe('Today / Study / Sleep / Digital の表示データ', () => {
  const usage = (start: string, seconds: number, category: string) => ({ type: 'usage', start: iso(start), seconds, category });

  it('Digital：昨日の減らしたい時間の合計と前日比（数字だけ）。音楽は含まない', async () => {
    const ctx = makeTestCtx('2026-10-08T09:00:00');
    await ingest(ctx, {
      items: [
        // 一昨日（10/6）60分、昨日（10/7）28分 → −32分
        usage('2026-10-06T10:00:00', 60, 'youtube'),
        ...Array.from({ length: 59 }, (_, i) => usage(`2026-10-06T10:${String(i + 1).padStart(2, '0')}:00`, 60, 'youtube')),
        ...Array.from({ length: 28 }, (_, i) => usage(`2026-10-07T11:${String(i).padStart(2, '0')}:00`, 60, 'x')),
        usage('2026-10-07T13:00:00', 60, 'youtube_music'),
      ],
    });
    const t = await buildToday(ctx);
    expect(t.digital.day).toMatchObject({ date: '2026-10-07', minutes: 28, musicMinutes: 1, diffMinutes: -32 });
  });

  it('Digital：前日にデータがなければ、前日比は null（使わなかった日と区別する）', async () => {
    const ctx = makeTestCtx('2026-10-08T09:00:00');
    await ingest(ctx, { items: [usage('2026-10-07T11:00:00', 60, 'x')] });
    expect((await buildToday(ctx)).digital.day.diffMinutes).toBeNull();
  });

  it('Digital：TikTok（Mac の拡張・iPhone のアプリ）が、減らしたい時間に入る。設定で外せる', async () => {
    const ctx = makeTestCtx('2026-10-08T09:00:00');
    await ingest(ctx, { items: [usage('2026-10-07T20:00:00', 60, 'tiktok')] });
    await ingestApp(ctx, { app: 'TikTok', event: 'open', at: '2026-10-07T21:00:00+09:00' });
    await ingestApp(ctx, { app: 'TikTok', event: 'close', at: '2026-10-07T21:10:00+09:00' });
    const v = await buildDigitalView(ctx);
    expect(v.yesterday.mac.byCategory).toEqual({ tiktok: 1 });
    expect(v.yesterday.iphone.byCategory).toEqual({ tiktok: 10 });
    expect(v.yesterday.minutes).toBe(11);
    await updateAppSettings(ctx, { digital: { reduce: ['youtube', 'x'] } });
    expect((await buildDigitalView(ctx)).yesterday.minutes).toBe(0);
  });

  it('Digital：23:30 以降の分数（昨夜）と、音楽は別枠', async () => {
    const ctx = makeTestCtx('2026-10-08T09:00:00');
    await ingest(ctx, {
      items: [usage('2026-10-07T23:20:00', 60, 'x'), usage('2026-10-08T00:10:00', 60, 'x'), usage('2026-10-08T00:20:00', 60, 'youtube_music')],
    });
    const v = await buildDigitalView(ctx);
    expect(v.night).toMatchObject({ nightDate: '2026-10-07', minutes: 1 });
    expect(v.night.mac.musicMinutes).toBe(1);
  });

  it('Study：科目別（今日・今週）、タイムライン、先週との差', async () => {
    const ctx = makeTestCtx('2026-10-07T20:00:00');
    const math = await createSubject(ctx, { name: '数学' });
    const eng = await createSubject(ctx, { name: '英語' });
    const run = async (sub: string | null, a: string, b: string, kind: 'study' | 'club' = 'study') => {
      await startSession(at(ctx, a), kind === 'study' ? { kind, subject_id: sub } : { kind });
      await stopSession(at(ctx, b), {});
    };
    await run(math.id, '2026-09-30T10:00:00', '2026-09-30T11:00:00'); // 先週（水）1h
    await run(math.id, '2026-10-05T10:00:00', '2026-10-05T12:00:00'); // 今週（月）2h
    await run(math.id, '2026-10-07T10:00:00', '2026-10-07T11:00:00'); // 今日 1h
    await run(eng.id, '2026-10-07T13:00:00', '2026-10-07T13:30:00'); // 今日 0.5h
    await run(null, '2026-10-07T16:00:00', '2026-10-07T17:00:00', 'club');
    const s = await buildStudy(ctx);
    expect(s.today.seconds).toBe(5400);
    expect(s.today.bySubject.map((x) => [x.name, x.seconds])).toEqual([['数学', 3600], ['英語', 1800]]);
    expect(s.today.timeline.map((x) => x.label)).toEqual(['数学', '英語', '部活']);
    expect(s.today.clubSeconds).toBe(3600);
    expect(s.week.seconds).toBe(3 * 3600 + 1800);
    expect(s.week.compare).toMatchObject({ thisSeconds: 3 * 3600 + 1800, lastSeconds: 3600, diffSeconds: 3600 * 2.5 });
  });

  it('Sleep：週平均と先週との差、平日平均', async () => {
    const ctx = makeTestCtx('2026-10-07T09:00:00');
    const night = async (bed: string, wake: string) => {
      await recordBed(at(ctx, bed));
      await recordWake(at(ctx, wake));
    };
    await night('2026-09-29T23:30:00', '2026-09-30T06:30:00'); // 先週（火）
    await night('2026-10-05T23:20:00', '2026-10-06T06:20:00'); // 今週（月）
    await night('2026-10-06T23:40:00', '2026-10-07T06:10:00'); // 今週（火）
    const v = await buildSleepView(ctx);
    expect(v.summary.thisWeek.nights).toBe(2);
    expect(v.summary.lastWeek.nights).toBe(1);
    expect(v.summary.last).toMatchObject({ bed: '23:40', wake: '06:10', durationMin: 390 });
    expect(v.summary.bedDiffMin).toBeCloseTo(0, 5); // 今週平均 23:30 / 先週 23:30
    expect(v.bedMessage).toBe('先週と同じ平均就寝です');
    expect(v.summary.weekdayAvgBed).not.toBeNull();
  });

  it('Today：睡眠時間（就寝・起床）が出る', async () => {
    const ctx = makeTestCtx('2026-10-07T09:00:00');
    await recordBed(at(ctx, '2026-10-06T23:30:00'));
    await recordWake(at(ctx, '2026-10-07T06:20:00'));
    expect((await buildToday(ctx)).sleep.lastNight?.durationMin).toBe(410);
  });
});

describe('土曜の夜は 03:00 まで制限しない', () => {
  it('設定の画面：土曜の夜は relaxed。ただし設定の変更は、制限中と同じく拒否する（API が 403）', async () => {
    const ctx = makeTestCtx('2026-10-10T12:00:00'); // 土曜
    const night = at(ctx, '2026-10-10T23:45:00');
    const v = await getSettingsView(night);
    expect(v).toMatchObject({ relaxed: true, locked: true, stage: 'hard' });
    expect(await status(updateAppSettings(night, { guard: { relaxSaturdayUntil: '05:00' } }))).toBe(403);
    expect(await status(updateAppSettings(night, { guard: { relaxSaturdayUntil: null } }))).toBe(403);
    expect(await status(updateAppSettings(night, { sleep: { wakeTime: '09:00' } }))).toBe(403);
  });
  it('土曜の昼なら変更できる。時刻を変えても、無効にしても保存される', async () => {
    const ctx = makeTestCtx('2026-10-10T12:00:00');
    expect((await getSettingsView(ctx)).settings.guard.relaxSaturdayUntil).toBe('03:00');
    expect((await updateAppSettings(ctx, { guard: { relaxSaturdayUntil: '04:00' } })).settings.guard.relaxSaturdayUntil).toBe('04:00');
    expect((await updateAppSettings(ctx, { guard: { relaxSaturdayUntil: null } })).settings.guard.relaxSaturdayUntil).toBeNull();
    expect((await getSettingsView(ctx)).settings.guard.relaxSaturdayUntil).toBeNull();
  });
  it('Level 2 より前の時刻は、400 で断る', async () => {
    const ctx = makeTestCtx('2026-10-10T12:00:00');
    expect(await status(updateAppSettings(ctx, { guard: { relaxSaturdayUntil: '23:00' } }))).toBe(400);
    expect(await status(updateAppSettings(ctx, { guard: { relaxSaturdayUntil: '25:00' } }))).toBe(400);
  });
  it('それ以外の日の夜は、これまでどおり', async () => {
    const ctx = makeTestCtx('2026-10-09T12:00:00'); // 金曜
    expect(await getSettingsView(at(ctx, '2026-10-09T23:45:00'))).toMatchObject({ relaxed: false, locked: true });
  });
});
