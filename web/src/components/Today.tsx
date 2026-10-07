'use client';
import { apiFetch, supabase } from '@/lib/client';
import { formatDelta } from '@/lib/digital';
import { formatClock, jstParts, parseHm } from '@/lib/jst';
import { formatDuration, formatMinutes, sleepRemainingMs } from '@/lib/messages';
import { useApi, useNow } from '@/lib/useApi';
import type { TodayView } from '@/server/handlers/today';
import { AppShell, SettingsLink } from './AppShell';
import { Card } from './Card';
import { LogInput } from './LogInput';
import { StudyTimer } from './StudyTimer';
import { TaskRow } from './Tasks';

type Act = ReturnType<typeof useApi>['act'];

/**
 * OS のホーム。カードを縦に並べる（PC では並べて全画面）。
 * 各カードをタップすると詳細画面へ。比べる相手は過去の自分で、増減は数字だけ出す。
 */
export function Today() {
  const { data: view, error, act } = useApi<TodayView>('/api/today', 30_000);

  if (!view) {
    return (
      <AppShell title="🌙 Today" right={<SettingsLink />}>
        <div className="muted">読み込み中…</div>
        <div className="err">{error}</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="🌙 Today" right={<SettingsLink />}>
      <div className="err">{error}</div>
      <div className="cards">
        <NightBanner view={view} />
        <SleepCard view={view} act={act} />
        <StudyCard view={view} act={act} />
        <TasksCard view={view} act={act} />
        <DigitalCard view={view} />
        <LogsCard view={view} act={act} />
      </div>
      <p className="muted" style={{ textAlign: 'center', marginTop: 16 }}>
        <a href="#" onClick={async (e) => { e.preventDefault(); await supabase().auth.signOut(); window.location.href = '/login'; }}>ログアウト</a>
      </p>
    </AppShell>
  );
}

/** 夜は「今寝れば◯時間◯分」を一番上に。起床予定は Settings の値 */
function NightBanner({ view }: { view: TodayView }) {
  const now = useNow();
  const p = jstParts(new Date(now));
  if (!(p.hh >= 22 || p.hh < 6)) return null;
  const wake = parseHm(view.wakeTime) ?? 375;
  const ms = sleepRemainingMs(now, p.hh * 60 + p.mm, wake);
  return (
    <section className="card night span-all">
      <h2>今寝れば</h2>
      <div className="big-num">{formatDuration(ms / 1000)}</div>
      <div className="muted">{view.wakeTime} に起きるとして、眠れます</div>
    </section>
  );
}

function SleepCard({ view, act }: { view: TodayView; act: Act }) {
  const s = view.sleep;
  const last = s.lastNight;
  return (
    <Card href="/life/sleep" title="Sleep">
      {last ? (
        <>
          <div className="lead">{last.durationMin !== null ? formatMinutes(last.durationMin) : '起床の記録なし'}</div>
          <div className="sub">
            就寝 {formatClock(new Date(last.sleep_at))}
            {last.wake_at ? ` ／ 起床 ${formatClock(new Date(last.wake_at))}` : ''}
            {last.source === 'auto' ? '（Watch）' : ''}
          </div>
          {s.diffMessage && <div className="sub">{s.diffMessage}</div>}
        </>
      ) : (
        <div className="sub">昨夜の記録はまだありません</div>
      )}
      <div className="seg" style={{ marginTop: 10 }}>
        <button className="primary" disabled={s.bedOpen} onClick={() => act(() => apiFetch('/api/sleep/bed', { body: {} }))}>寝る</button>
        <button disabled={!s.bedOpen} onClick={() => act(() => apiFetch('/api/sleep/wake', { body: {} }))}>起きた</button>
      </div>
    </Card>
  );
}

function StudyCard({ view, act }: { view: TodayView; act: Act }) {
  const total = view.study.todaySeconds;
  return (
    <Card href="/study" title="Study">
      <div className="lead">{formatDuration(total)}</div>
      <div className="sub">今日の勉強</div>
      {view.study.bySubject.length > 0 && (
        <div style={{ margin: '8px 0 12px' }}>
          {view.study.bySubject.map((x) => (
            <div key={x.subject_id ?? 'none'} className="stat"><span>{x.name}</span><span>{formatDuration(x.seconds)}</span></div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        <StudyTimer subjects={view.subjects} active={view.active} act={act} />
      </div>
    </Card>
  );
}

function TasksCard({ view, act }: { view: TodayView; act: Act }) {
  return (
    <Card href="/tasks" title="Tasks">
      {view.tasks.length === 0 ? (
        <div className="sub">期限が近い課題はありません</div>
      ) : (
        <ul className="plain">{view.tasks.map((t) => <TaskRow key={t.id} task={t} act={act} compact />)}</ul>
      )}
    </Card>
  );
}

function DigitalCard({ view }: { view: TodayView }) {
  const d = view.digital.day;
  return (
    <Card href="/life/digital" title="Digital">
      <div className="lead">{d.minutes}分</div>
      <div className="sub">
        昨日の減らしたい時間
        {d.diffMinutes !== null && <span className="delta">　昨日より{formatDelta(d.diffMinutes)}</span>}
      </div>
      {d.musicMinutes > 0 && <div className="sub">音楽・BGM {d.musicMinutes}分（含めていません）</div>}
    </Card>
  );
}

function LogsCard({ view, act }: { view: TodayView; act: Act }) {
  return (
    <Card href="/life/logs" title="ログ">
      <LogInput act={act} />
      {view.logsToday.length > 0 && (
        <ul className="plain" style={{ marginTop: 8 }}>
          {view.logsToday.map((l) => <li key={l.id}><span>{l.body}</span><span className="pill">{l.tag}</span></li>)}
        </ul>
      )}
    </Card>
  );
}
