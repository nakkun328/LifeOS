'use client';
import type { DigitalTotals } from '@/lib/aggregate';
import { formatDelta } from '@/lib/digital';
import { serviceLabel } from '@/lib/labels';
import { useApi } from '@/lib/useApi';
import type { DigitalView } from '@/server/handlers/digitalView';
import { AppShell } from './AppShell';

function Services({ t }: { t: DigitalTotals }) {
  const rows = Object.entries(t.byCategory).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <div className="stat"><span>減らしたい時間</span><span>{t.minutes}分</span></div>
      {rows.map(([c, m]) => <div key={c} className="stat sub"><span>　{serviceLabel(c)}</span><span>{m}分</span></div>)}
      {t.musicMinutes > 0 && <div className="stat sub"><span>音楽・BGM（含めません）</span><span>{t.musicMinutes}分</span></div>}
    </>
  );
}

/** Digital：減らしたい時間の合計と前日比、サービス別（Mac と iPhone は分ける）、23:30以降の分数（成功指標） */
export function DigitalDetail() {
  const { data: v, error } = useApi<DigitalView>('/api/digital', 60_000);
  if (!v) return <AppShell title="Digital" back="/life"><div className="muted">読み込み中…</div><div className="err">{error}</div></AppShell>;
  const y = v.yesterday;
  return (
    <AppShell title="Digital" back="/life">
      <div className="err">{error}</div>
      <div className="cards">
        <section className="card">
          <h2>昨日</h2>
          <div className="lead">{y.minutes}分</div>
          <div className="sub">
            減らしたい時間の合計（{y.date}）
            {y.diffMinutes !== null ? <span className="delta">　昨日より{formatDelta(y.diffMinutes)}</span> : '　（前の日の記録がないので、比べられません）'}
          </div>
          {y.musicMinutes > 0 && <div className="sub">音楽・BGM {y.musicMinutes}分（含めていません）</div>}
        </section>

        <section className="card">
          <h2>昨夜（23:30以降）</h2>
          <div className="lead">{v.night.minutes}分</div>
          <div className="sub">
            Mac {v.night.mac.minutes}分 ／ iPhone {v.night.iphone.minutes}分 ／ 一時解除 {v.night.unlocks}回
          </div>
        </section>

        <section className="card">
          <h2>昨日：Mac</h2>
          <Services t={y.mac} />
        </section>

        <section className="card">
          <h2>昨日：iPhone</h2>
          <Services t={y.iphone} />
        </section>

        <section className="card span-all">
          <h2>今日（途中）</h2>
          <div className="stat"><span>減らしたい時間</span><span>{v.today.minutes}分（Mac {v.today.mac.minutes} ／ iPhone {v.today.iphone.minutes}）</span></div>
          <div className="sub" style={{ marginTop: 6 }}>減らしたいサービス：{v.reduce.map(serviceLabel).join('・') || 'なし'}（Settings で変更）</div>
        </section>
      </div>
    </AppShell>
  );
}
