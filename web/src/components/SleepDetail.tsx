'use client';
import { apiFetch } from '@/lib/client';
import { formatBedMinutes } from '@/lib/jst';
import { formatMinutes } from '@/lib/messages';
import { useApi } from '@/lib/useApi';
import type { SleepView } from '@/server/handlers/sleepView';
import { AppShell } from './AppShell';

/** Sleep：就寝・起床の記録、睡眠時間、今週の平均と先週との差、平日の平均就寝（成功指標） */
export function SleepDetail() {
  const { data: v, error, act } = useApi<SleepView>('/api/sleep/summary', 30_000);
  if (!v) return <AppShell title="Sleep" back="/life"><div className="muted">読み込み中…</div><div className="err">{error}</div></AppShell>;
  const s = v.summary;
  const bed = (m: number | null) => (m === null ? '--:--' : formatBedMinutes(m));
  const dur = (m: number | null) => (m === null ? '--' : formatMinutes(m));
  return (
    <AppShell title="Sleep" back="/life">
      <div className="err">{error}</div>
      <div className="cards">
        <section className="card">
          <h2>記録</h2>
          <div className="seg">
            <button className="primary big" disabled={v.bedOpen} onClick={() => act(() => apiFetch('/api/sleep/bed', { body: {} }))}>寝る</button>
            <button className="big" disabled={!v.bedOpen} onClick={() => act(() => apiFetch('/api/sleep/wake', { body: {} }))}>起きた</button>
          </div>
          <div className="sub" style={{ marginTop: 8 }}>目標就寝 {v.targetBed} ／ 起床予定 {v.wakeTime}</div>
        </section>

        <section className="card">
          <h2>昨夜</h2>
          {s.last ? (
            <>
              <div className="lead">{s.last.durationMin !== null ? formatMinutes(s.last.durationMin) : '起床の記録なし'}</div>
              <div className="sub">就寝 {s.last.bed}{s.last.wake ? ` ／ 起床 ${s.last.wake}` : ''}{s.last.source === 'auto' ? '（Watch）' : ''}</div>
            </>
          ) : <div className="sub">まだ記録がありません</div>}
        </section>

        <section className="card">
          <h2>今週の平均</h2>
          <div className="stat"><span>就寝</span><span>{bed(s.thisWeek.avgBedMinutes)}</span></div>
          <div className="stat"><span>睡眠時間</span><span>{dur(s.thisWeek.avgDurationMin)}</span></div>
          <div className="stat muted"><span>先週の平均</span><span>{bed(s.lastWeek.avgBedMinutes)}　{dur(s.lastWeek.avgDurationMin)}</span></div>
          {v.bedMessage && <div className="sub" style={{ marginTop: 6 }}>{v.bedMessage}</div>}
          {v.durationMessage && <div className="sub">{v.durationMessage}</div>}
        </section>

        <section className="card">
          <h2>平日の平均就寝</h2>
          <div className="lead">{s.weekdayAvgBed ?? '--:--'}</div>
          <div className="sub">日〜木の夜、直近28日　目標 {v.targetBed}</div>
        </section>

        <section className="card span-all">
          <h2>直近の記録</h2>
          {s.recent.length === 0 ? <div className="sub">まだ記録がありません</div> : (
            <ul className="plain">
              {s.recent.map((r) => (
                <li key={r.night_date}>
                  <span>{r.night_date}　就寝 {r.bed}{r.wake ? `　起床 ${r.wake}` : ''}</span>
                  <span className="sub">{r.durationMin !== null ? formatMinutes(r.durationMin) : '—'}{r.source === 'auto' ? '（Watch）' : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
