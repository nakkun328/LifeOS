'use client';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch, supabase } from '@/lib/client';
import { formatClock, jstParts, parseHm } from '@/lib/jst';
import { formatDuration, sleepRemainingMs } from '@/lib/messages';
import type { TodayView } from '@/server/handlers/today';
import { LogsCard } from './Logs';
import { Nav } from './Nav';
import { TasksCard } from './Tasks';

const CATEGORY_LABEL: Record<string, string> = {
  youtube: 'YouTube',
  youtube_shorts: 'Shorts',
  x: 'X',
  instagram: 'Instagram',
};
const label = (c: string) => CATEGORY_LABEL[c] ?? c;

function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function Today() {
  const [view, setView] = useState<TodayView | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setView(await apiFetch<TodayView>('/api/today'));
      setError('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) window.location.href = '/login';
      else setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  /** 操作 → 再読み込み。エラーは画面に出す */
  const act = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        setError('');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      await load();
    },
    [load],
  );

  if (!view) return <main><div className="muted">読み込み中…{error && <div className="err">{error}</div>}</div></main>;

  return (
    <main>
      <Nav current="/" />
      <h1>🌙 Today</h1>
      <div className="err">{error}</div>
      <NightBanner view={view} />
      <StudyCard view={view} act={act} />
      <SleepCard view={view} act={act} />
      <TasksCard tasks={view.tasks} act={act} />
      <LogsCard logs={view.logsToday} act={act} />
      <DigitalCard view={view} />
      <p className="muted" style={{ textAlign: 'center' }}>
        <a href="#" onClick={async (e) => { e.preventDefault(); await supabase().auth.signOut(); window.location.href = '/login'; }}>ログアウト</a>
      </p>
    </main>
  );
}

type Act = (fn: () => Promise<unknown>) => Promise<void>;

function NightBanner({ view }: { view: TodayView }) {
  const now = useNow();
  const p = jstParts(new Date(now));
  if (!(p.hh >= 22 || p.hh < 6)) return null;
  const wake = parseHm(view.wakeTime) ?? 375;
  const ms = sleepRemainingMs(now, p.hh * 60 + p.mm, wake);
  return (
    <section className="card night">
      <h2>今寝れば</h2>
      <div className="big-num">{formatDuration(ms / 1000)}</div>
      <div className="muted">{view.wakeTime} に起きるとして、眠れます</div>
    </section>
  );
}

function StudyCard({ view, act }: { view: TodayView; act: Act }) {
  const now = useNow();
  const [subjectId, setSubjectId] = useState('');
  const [newName, setNewName] = useState('');
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [ack, setAck] = useState(false);
  const [kind, setKind] = useState<'study' | 'club'>('study');
  const active = view.active;
  const chosen = subjectId || view.subjects[0]?.id || '';

  if (reviewId) return <ReviewCard id={reviewId} done={() => setReviewId(null)} act={act} />;

  return (
    <section className="card">
      <h2>{active ? (active.kind === 'club' ? '部活 計測中' : `${active.subject_name ?? '勉強'} 計測中`) : 'Study'}</h2>
      {active ? (
        <>
          <div className="big-num">{formatDuration((now - Date.parse(active.started_at)) / 1000)}</div>
          {active.long_running && !ack && <div className="muted">3時間を超えました。まだ続けていますか？</div>}
          <div className="row" style={{ marginTop: 8 }}>
            <button
              className="primary big"
              onClick={() => act(async () => { const s = await apiFetch<{ id: string }>('/api/sessions/stop', { body: {} }); setReviewId(s.id); })}
            >
              STOP
            </button>
            {active.long_running && !ack && <button onClick={() => setAck(true)}>続ける</button>}
          </div>
        </>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 8 }}>
            <button className={kind === 'study' ? 'primary' : ''} onClick={() => setKind('study')}>勉強</button>
            <button className={kind === 'club' ? 'primary' : ''} onClick={() => setKind('club')}>部活</button>
          </div>
          <div className="row">
            {kind === 'study' ? (
              <select className="grow" value={chosen} onChange={(e) => setSubjectId(e.target.value)}>
                {view.subjects.length === 0 && <option value="">科目を追加してください</option>}
                {view.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            ) : <span className="grow muted">部活の時間を計ります</span>}
            <button className="primary big" disabled={kind === 'study' && !chosen}
              onClick={() => act(() => apiFetch('/api/sessions/start', { body: kind === 'study' ? { kind, subject_id: chosen } : { kind } }))}>
              START
            </button>
          </div>
        </>
      )}
      <div style={{ marginTop: 12 }}>
        <div className="stat"><span>今日の勉強</span><span>{formatDuration(view.study.todaySeconds)}</span></div>
        <div className="stat"><span>今週の勉強</span><span>{formatDuration(view.study.weekSeconds)}</span></div>
        {(view.club.weekSeconds > 0 || view.club.todaySeconds > 0) && (
          <>
            <div className="stat"><span>今日の部活</span><span>{formatDuration(view.club.todaySeconds)}</span></div>
            <div className="stat"><span>今週の部活</span><span>{formatDuration(view.club.weekSeconds)}</span></div>
          </>
        )}
      </div>
      <details style={{ marginTop: 10 }} open={edit} onToggle={(e) => setEdit((e.target as HTMLDetailsElement).open)}>
        <summary className="muted">科目の追加・編集</summary>
        <div className="row" style={{ margin: '8px 0' }}>
          <input className="grow" placeholder="新しい科目" value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} />
          <button disabled={!newName.trim()} onClick={() => act(async () => { await apiFetch('/api/subjects', { body: { name: newName } }); setNewName(''); })}>追加</button>
        </div>
        <ul className="plain">
          {view.subjects.map((s) => (
            <li key={s.id}>
              <span>{s.name}</span>
              <span className="row">
                <button onClick={() => { const n = window.prompt('科目名', s.name); if (n?.trim()) void act(() => apiFetch(`/api/subjects/${s.id}`, { method: 'PATCH', body: { name: n } })); }}>名前変更</button>
                <button onClick={() => { if (window.confirm(`「${s.name}」を一覧から外しますか？（記録は残ります）`)) void act(() => apiFetch(`/api/subjects/${s.id}`, { method: 'PATCH', body: { archived: true } })); }}>外す</button>
              </span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function ReviewCard({ id, done, act }: { id: string; done: () => void; act: Act }) {
  const [efficiency, setEfficiency] = useState<number | null>(null);
  const [progress, setProgress] = useState('');
  const [note, setNote] = useState('');
  return (
    <section className="card">
      <h2>おつかれさま。ふりかえり（任意）</h2>
      <div className="stars" style={{ marginBottom: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} className={efficiency === n ? 'primary' : ''} onClick={() => setEfficiency(n)}>{n}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        <input placeholder="進捗（例：第3章まで）" value={progress} onChange={(e) => setProgress(e.target.value)} />
        <input placeholder="メモ" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="row">
          <button className="primary" onClick={() => act(async () => { await apiFetch(`/api/sessions/${id}`, { method: 'PATCH', body: { efficiency, progress, note } }); done(); })}>保存</button>
          <button onClick={done}>スキップ</button>
        </div>
      </div>
    </section>
  );
}

function SleepCard({ view, act }: { view: TodayView; act: Act }) {
  const s = view.sleep;
  return (
    <section className="card">
      <h2>睡眠</h2>
      <div className="row">
        <button className="primary big" disabled={s.bedOpen} onClick={() => act(() => apiFetch('/api/sleep/bed', { body: {} }))}>寝る</button>
        <button className="big" disabled={!s.bedOpen} onClick={() => act(() => apiFetch('/api/sleep/wake', { body: {} }))}>起きた</button>
      </div>
      <div style={{ marginTop: 10 }}>
        {s.lastNight ? (
          <div className="stat"><span>昨夜の就寝</span><span>{formatClock(new Date(s.lastNight.sleep_at))}</span></div>
        ) : (
          <div className="muted">まだ記録がありません</div>
        )}
        {s.diffMessage && <div className="stat"><span>前日との差</span><span>{s.diffMessage}</span></div>}
        <div className="stat"><span>平日の平均就寝</span><span>{s.weekdayAvgBed ?? '--:--'}</span></div>
      </div>
    </section>
  );
}

function DigitalCard({ view }: { view: TodayView }) {
  const d = view.digital;
  const rows = Object.entries(d.mac.byCategory);
  return (
    <section className="card">
      <h2>昨夜のDigital（23:30以降）</h2>
      <div className="stat"><span>Mac（YouTube・X・Instagram）</span><span>{d.mac.minutes}分</span></div>
      {rows.map(([c, m]) => <div key={c} className="stat muted"><span>　{label(c)}</span><span>{m}分</span></div>)}
      {d.mac.musicMinutes > 0 && <div className="stat muted"><span>　音楽（含めません）</span><span>{d.mac.musicMinutes}分</span></div>}
      <div className="stat"><span>iPhone</span><span>{d.iphone.minutes}分</span></div>
      {Object.entries(d.iphone.byCategory).map(([c, m]) => <div key={c} className="stat muted"><span>　{label(c)}</span><span>{m}分</span></div>)}
      <div className="stat"><span>Night Guard の一時解除</span><span>{d.unlocks}回</span></div>
    </section>
  );
}
