'use client';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/client';
import {
  avgScore,
  chartSeries,
  MOTIV_DEFAULT,
  MOTIV_GROUPS,
  MOTIV_ITEMS,
  MOTIV_MAX,
  MOTIV_MIN,
  type ChartRange,
  type ItemSeries,
  type MotivKey,
  type MotivRecord,
  type MotivScores,
} from '@/lib/motivation';
import { useApi, type Act } from '@/lib/useApi';
import { AppShell } from './AppShell';

type View = { today: string; records: MotivRecord[] };

const fmt1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1);
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/**
 * 入力：開発と趣味の2グループにスライダー。今日の記録があれば、その値から始める。
 * 今日の記録で欠けている項目は、触るまで「未記録」のまま（5 で埋めて保存しない）。
 * 今日の記録がまだないときは、旧アプリと同じく、6項目すべてを初期値 5 から付ける。
 */
export function MotivationInput({ today, record, act, onSaved }: { today: string; record: MotivRecord | null; act: Act; onSaved?: () => void }) {
  const [vals, setVals] = useState<MotivScores>({});
  const [touched, setTouched] = useState<Set<MotivKey>>(new Set());
  const [comment, setComment] = useState('');
  const [saved, setSaved] = useState(false);

  // 保存済みの記録（または日付の変わり目）が変わったら、その値で初期化する
  const sig = `${today}|${JSON.stringify(record)}`;
  useEffect(() => {
    setVals(record?.scores ?? {});
    setTouched(new Set(record ? (Object.keys(record.scores) as MotivKey[]) : MOTIV_ITEMS.map((i) => i.key)));
    setComment(record?.comment ?? '');
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: MotivKey, v: number) => {
    setVals((p) => ({ ...p, [k]: v }));
    setTouched((p) => new Set(p).add(k));
    setSaved(false);
  };
  const submit = () =>
    act(async () => {
      const scores: MotivScores = {};
      for (const k of touched) scores[k] = vals[k] ?? MOTIV_DEFAULT;
      await apiFetch('/api/motivation', { body: { scores, comment } });
      setSaved(true);
      onSaved?.();
    });

  return (
    <div className="form-grid">
      <div className="sub">{record ? `今日（${md(today)}）の記録を、書き直せます` : `今日（${md(today)}）のモチベを付けます（1〜10）`}</div>
      {MOTIV_GROUPS.map((g) => (
        <div key={g.id}>
          <div className="sub" style={{ marginBottom: 4 }}>{g.label}</div>
          {MOTIV_ITEMS.filter((i) => i.group === g.id).map((i) => {
            const on = touched.has(i.key);
            return (
              <label key={i.key} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 8px', alignItems: 'center', margin: '8px 0' }}>
                <span><span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 99, background: i.color, marginRight: 6 }} />{i.label}</span>
                <b style={{ minWidth: 28, textAlign: 'right', opacity: on ? 1 : 0.45 }}>{on ? (vals[i.key] ?? MOTIV_DEFAULT) : '未記録'}</b>
                <input
                  type="range"
                  min={MOTIV_MIN}
                  max={MOTIV_MAX}
                  step={1}
                  value={vals[i.key] ?? MOTIV_DEFAULT}
                  onChange={(e) => set(i.key, Number(e.target.value))}
                  aria-label={`${i.label}の点数`}
                  style={{ gridColumn: '1 / -1', width: '100%', accentColor: i.color, opacity: on ? 1 : 0.5 }}
                />
              </label>
            );
          })}
        </div>
      ))}
      <input placeholder="一言メモ（任意）" value={comment} maxLength={500} onChange={(e) => { setComment(e.target.value); setSaved(false); }} />
      <div className="row">
        <button className="primary" disabled={touched.size === 0} onClick={submit}>記録する</button>
        {saved && <span className="sub" role="status">記録しました</span>}
      </div>
    </div>
  );
}

// ---- グラフ（SVG の折れ線。ライブラリは使わない） ----

const W = 320;
const PAD = { l: 22, r: 8, t: 8, b: 18 };

function LineChart({ dates, series, height = 150 }: { dates: string[]; series: ItemSeries[]; height?: number }) {
  const H = height;
  const x = (i: number) => PAD.l + (dates.length <= 1 ? (W - PAD.l - PAD.r) / 2 : (i / (dates.length - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - (v - MOTIV_MIN) / (MOTIV_MAX - MOTIV_MIN)) * (H - PAD.t - PAD.b);
  const ticks = [1, 5, 10];
  const labelIdx = dates.length <= 1 ? [0] : [0, Math.floor((dates.length - 1) / 2), dates.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="モチベの折れ線グラフ" style={{ display: 'block', maxHeight: H * 2 }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#2a3558" strokeWidth={1} />
          <text x={PAD.l - 4} y={y(t) + 3} textAnchor="end" fontSize={9} fill="#8b95b5">{t}</text>
        </g>
      ))}
      {labelIdx.map((i, k) => (
        <text key={`${i}-${k}`} x={x(i)} y={H - 4} textAnchor={k === 0 ? 'start' : k === labelIdx.length - 1 ? 'end' : 'middle'} fontSize={9} fill="#8b95b5">{md(dates[i]!)}</text>
      ))}
      {series.map((s) => {
        // 記録のない日は線をつながない（欠けは欠けのまま）
        const segs: string[] = [];
        let cur = '';
        s.points.forEach((p, i) => {
          if (p === null) { if (cur) segs.push(cur); cur = ''; return; }
          cur += `${cur ? 'L' : 'M'}${x(i).toFixed(1)},${y(p).toFixed(1)}`;
        });
        if (cur) segs.push(cur);
        return (
          <g key={s.key}>
            {segs.map((d, k) => <path key={k} d={d} fill="none" stroke={s.color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />)}
            {s.points.map((p, i) => (p === null ? null : <circle key={i} cx={x(i)} cy={y(p)} r={dates.length > 40 ? 1.6 : 2.4} fill={s.color} />))}
          </g>
        );
      })}
    </svg>
  );
}

const RANGES: Array<{ id: ChartRange; label: string }> = [{ id: 7, label: '7日' }, { id: 30, label: '30日' }, { id: 'all', label: '全期間' }];

export function MotivationCharts({ records, today }: { records: MotivRecord[]; today: string }) {
  const [range, setRange] = useState<ChartRange>(30);
  const data = useMemo(() => chartSeries(records, range, today), [records, range, today]);
  const any = data.items.some((i) => i.n > 0);
  return (
    <div>
      <div className="seg" role="group" aria-label="期間">
        {RANGES.map((r) => (
          <button key={String(r.id)} className={range === r.id ? 'primary' : ''} aria-pressed={range === r.id} onClick={() => setRange(r.id)}>{r.label}</button>
        ))}
      </div>
      {!any ? (
        <div className="sub" style={{ marginTop: 8 }}>この期間の記録はまだありません。</div>
      ) : (
        <>
          <h3 className="sub" style={{ margin: '12px 0 4px' }}>全項目</h3>
          <LineChart dates={data.dates} series={data.items} height={170} />
          <div className="row" style={{ gap: '4px 12px', marginTop: 4 }}>
            {data.items.map((i) => <span key={i.key} className="sub"><span aria-hidden style={{ color: i.color }}>●</span> {i.label}</span>)}
          </div>
          <div className="mini-grid" style={{ marginTop: 12 }}>
            {data.items.map((i) => (
              <div key={i.key} className="mini">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span><span aria-hidden style={{ color: i.color }}>●</span> {i.label}</span>
                  <span className="sub">{i.avg === null ? '記録なし' : `平均 ${fmt1(i.avg)}（${i.n}日）`}</span>
                </div>
                <LineChart dates={data.dates} series={[i]} height={110} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function MotivationHistory({ records }: { records: MotivRecord[] }) {
  const [shown, setShown] = useState(30);
  const all = [...records].reverse();
  const rows = all.slice(0, shown);
  if (all.length === 0) return <div className="sub">まだ記録がありません。</div>;
  return (
    <>
    <ul className="plain">
      {rows.map((r) => {
        const avg = avgScore(r.scores);
        return (
          <li key={r.record_date} style={{ display: 'block' }}>
            <div><b>{r.record_date}</b>{avg !== null && <span className="sub">　平均 {fmt1(avg)}</span>}</div>
            <div className="chips">
              {MOTIV_ITEMS.filter((i) => r.scores[i.key] !== undefined).map((i) => (
                <span key={i.key} className="chip" style={{ borderColor: i.color }}><span aria-hidden style={{ color: i.color }}>●</span> {i.label} {r.scores[i.key]}</span>
              ))}
            </div>
            {r.comment && <div className="sub">{r.comment}</div>}
          </li>
        );
      })}
    </ul>
    {all.length > shown && <button onClick={() => setShown((n) => n + 30)} style={{ marginTop: 8 }}>さらに表示（残り {all.length - shown}日）</button>}
    </>
  );
}

export function MotivationPage() {
  const { data: v, error, act, reload } = useApi<View>('/api/motivation');
  const todayRec = v?.records.find((r) => r.record_date === v.today) ?? null;
  return (
    <AppShell title="Motivation" back="/life">
      <div className="err">{error}</div>
      {v === null ? (
        <div className="muted">読み込み中…</div>
      ) : (
        <div className="cards">
          <section className="card">
            <h2>記録</h2>
            <MotivationInput today={v.today} record={todayRec} act={act} onSaved={reload} />
          </section>
          <section className="card span-all">
            <h2>グラフ</h2>
            <MotivationCharts records={v.records} today={v.today} />
          </section>
          <section className="card span-all">
            <h2>履歴</h2>
            <MotivationHistory records={v.records} />
          </section>
        </div>
      )}
    </AppShell>
  );
}
