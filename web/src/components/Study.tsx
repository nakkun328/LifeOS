'use client';
import { formatClock } from '@/lib/jst';
import { formatDuration, formatDurationDelta } from '@/lib/messages';
import { useApi } from '@/lib/useApi';
import type { StudyView } from '@/server/handlers/study';
import { AppShell } from './AppShell';
import { StudyTimer } from './StudyTimer';

function Breakdown({ rows, total }: { rows: Array<{ subject_id: string | null; name: string; seconds: number }>; total: number }) {
  if (rows.length === 0) return <div className="sub">まだ記録がありません</div>;
  return (
    <div>
      {rows.map((r) => (
        <div key={r.subject_id ?? 'none'} style={{ marginBottom: 8 }}>
          <div className="stat" style={{ border: 0, padding: '2px 0' }}><span>{r.name}</span><span>{formatDuration(r.seconds)}</span></div>
          <div className="bar"><span style={{ width: `${total > 0 ? Math.round((r.seconds / total) * 100) : 0}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

/** 科目別の時間（今日・今週）、今日のタイムライン、今週の合計と先週との差 */
export function StudyPage() {
  const { data: v, error, act } = useApi<StudyView>('/api/study', 30_000);
  if (!v) {
    return <AppShell title="Study"><div className="muted">読み込み中…</div><div className="err">{error}</div></AppShell>;
  }
  const c = v.week.compare;
  return (
    <AppShell title="Study">
      <div className="err">{error}</div>
      <div className="cards">
        <section className="card">
          <h2>タイマー</h2>
          <StudyTimer subjects={v.subjects} active={v.active} act={act} />
        </section>

        <section className="card">
          <h2>今日</h2>
          <div className="lead">{formatDuration(v.today.seconds)}</div>
          {v.today.clubSeconds > 0 && <div className="sub">部活 {formatDuration(v.today.clubSeconds)}（勉強には含めていません）</div>}
          <div style={{ marginTop: 10 }}><Breakdown rows={v.today.bySubject} total={v.today.seconds} /></div>
        </section>

        <section className="card">
          <h2>今週</h2>
          <div className="lead">{formatDuration(v.week.seconds)}</div>
          <div className="sub">
            先週の同じ時点との差 <span className="delta">{formatDurationDelta(c.diffSeconds)}</span>
            （先週は {formatDuration(c.lastSeconds)}）
          </div>
          {v.week.clubSeconds > 0 && <div className="sub">部活 {formatDuration(v.week.clubSeconds)}</div>}
          <div style={{ marginTop: 10 }}><Breakdown rows={v.week.bySubject} total={v.week.seconds} /></div>
        </section>

        <section className="card">
          <h2>今日のタイムライン</h2>
          {v.today.timeline.length === 0 ? (
            <div className="sub">まだ記録がありません</div>
          ) : (
            <div className="tl">
              {v.today.timeline.map((t) => (
                <div className="item" key={t.id}>
                  <div>{formatClock(new Date(t.start))}〜{t.running ? '' : formatClock(new Date(t.end))}　{t.label}{t.kind === 'club' && <span className="badge">部活</span>}</div>
                  <div className="sub">{formatDuration(t.seconds)}{t.running ? '（計測中）' : ''}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
