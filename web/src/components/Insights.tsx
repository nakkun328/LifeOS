'use client';
import { useApi } from '@/lib/useApi';
import type { Line, Pending, Section } from '@/lib/insights';
import type { InsightsView } from '@/server/handlers/insights';
import { AppShell } from './AppShell';

/** 結論の1行。もとにした件数は小さく添える */
function LineItem({ l }: { l: Line }) {
  return (
    <li style={{ display: 'block' }}>
      <div>{l.text}</div>
      <div className="sub">もとにした件数：{l.n}{l.unit}</div>
    </li>
  );
}

/** 件数が足りない項目：空の画面にせず、あと何件たまると表示されるかを出す */
function PendingItem({ p }: { p: Pending }) {
  return (
    <li style={{ display: 'block' }}>
      <div>{p.label}</div>
      <div className="sub">あと{p.remaining}{p.unit}たまると表示されます（いま {p.have}{p.unit}）</div>
    </li>
  );
}

function SectionBody({ s }: { s: Section }) {
  return (
    <ul className="plain">
      {s.lines.map((l) => <LineItem key={l.key} l={l} />)}
      {s.pending.map((p) => <PendingItem key={p.key} p={p} />)}
    </ul>
  );
}

export function InsightsPage() {
  const { data: v, error } = useApi<InsightsView>('/api/insights');
  return (
    <AppShell title="Insights">
      <div className="err">{error}</div>
      {v === null ? (
        <div className="muted">読み込み中…</div>
      ) : (
        <div className="cards">
          <section className="card span-all">
            <h2>今週と先週</h2>
            {v.week.headline && <div className="lead">{v.week.headline}</div>}
            <SectionBody s={v.week} />
            <div className="sub">先週の「同じ時点まで」と比べています。</div>
          </section>
          <section className="card">
            <h2>勉強：時間帯と効率</h2>
            <SectionBody s={v.study.band} />
          </section>
          <section className="card">
            <h2>勉強：セッションの長さと効率</h2>
            <SectionBody s={v.study.length} />
          </section>
          <section className="card">
            <h2>睡眠と Digital</h2>
            <SectionBody s={v.sleep.digitalBed} />
          </section>
          <section className="card">
            <h2>就寝と、翌日の勉強</h2>
            <SectionBody s={v.sleep.bedNextDay} />
          </section>
          <p className="sub span-all">
            直近6週間のデータから出しています（勉強の効率は90日）。ここに出るのは「そういう傾向がある」という目安で、原因を示すものではありません。
            効率は、勉強を終えるときに入れた 1〜5 の値です。
          </p>
        </div>
      )}
    </AppShell>
  );
}
