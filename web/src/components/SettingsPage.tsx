'use client';
import { useEffect, useState } from 'react';
import type { AppSettings } from '@/lib/appSettings';
import { KNOWN_SERVICES } from '@/lib/appSettings';
import { apiFetch } from '@/lib/client';
import { serviceLabel } from '@/lib/labels';
import { useApi, type Act } from '@/lib/useApi';
import type { SettingsView } from '@/server/handlers/settings';
import { AppShell } from './AppShell';
import { MotivationImport } from './MotivationImport';
import { SubjectManager } from './SubjectManager';

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

/** Life OS の設定（唯一の正）。拡張も、ここの値を取り込んで使う */
export function SettingsPage() {
  const { data: v, error, act, reload } = useApi<SettingsView>('/api/settings', 15_000);
  if (!v) return <AppShell title="Settings" back="/"><div className="muted">読み込み中…</div><div className="err">{error}</div></AppShell>;
  return (
    <AppShell title="Settings" back="/">
      <div className="err">{error}</div>
      {v.locked && (
        <div className="banner span-all" role="status">
          Night Guard の制限中のため、<strong>Sleep と Night Guard</strong> の設定は変更できません（朝の自動解除のあとに変更できます）。
        </div>
      )}
      <div className="cards">
        <SleepForm s={v.settings} locked={v.locked} act={act} onSaved={reload} />
        <GuardForm s={v.settings} locked={v.locked} act={act} onSaved={reload} />
        <DigitalForm s={v.settings} act={act} />
        <section className="card">
          <h2>Study：科目</h2>
          <SubjectManager />
        </section>
        <MotivationImport />
      </div>
    </AppShell>
  );
}

function useSave(act: Act) {
  const [ok, setOk] = useState('');
  const save = (body: unknown) =>
    act(async () => {
      setOk('');
      await apiFetch('/api/settings', { method: 'PUT', body });
      setOk('保存しました');
    });
  return { ok, save };
}

function SleepForm({ s, locked, act }: { s: AppSettings; locked: boolean; act: Act; onSaved: () => void }) {
  const [bed, setBed] = useState(s.sleep.targetBed);
  const [wake, setWake] = useState(s.sleep.wakeTime);
  useEffect(() => { setBed(s.sleep.targetBed); setWake(s.sleep.wakeTime); }, [s.sleep.targetBed, s.sleep.wakeTime]);
  const { ok, save } = useSave(act);
  return (
    <section className="card">
      <h2>Sleep{locked && <span className="badge warn">制限中は変更不可</span>}</h2>
      <div className="form-grid">
        <label className="field">目標就寝時刻<input type="time" value={bed} disabled={locked} onChange={(e) => setBed(e.target.value)} /></label>
        <label className="field">起床予定時刻（「今寝れば」の計算に使います）<input type="time" value={wake} disabled={locked} onChange={(e) => setWake(e.target.value)} /></label>
        <div className="row">
          <button className="primary" disabled={locked} onClick={() => save({ sleep: { targetBed: bed, wakeTime: wake } })}>保存</button>
          <span className="sub">{ok}</span>
        </div>
      </div>
    </section>
  );
}

function GuardForm({ s, locked, act }: { s: AppSettings; locked: boolean; act: Act; onSaved: () => void }) {
  const g = s.guard;
  const [f, setF] = useState({ ...g, allowed: g.allowedPlaylists.join('\n') });
  useEffect(() => setF({ ...g, allowed: g.allowedPlaylists.join('\n') }), [g]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const { ok, save } = useSave(act);
  const time = (k: 'prepareTime' | 'level1Time' | 'level2Time' | 'releaseTime', label: string) => (
    <label className="field">{label}<input type="time" value={f[k]} disabled={locked} onChange={(e) => set(k, e.target.value)} /></label>
  );
  return (
    <section className="card">
      <h2>Night Guard{locked && <span className="badge warn">制限中は変更不可</span>}</h2>
      <div className="form-grid">
        {time('prepareTime', '寝る準備の通知')}
        {time('level1Time', 'Level 1（Shorts・X・Instagram・TikTok を制限）')}
        {time('level2Time', 'Level 2（YouTube 全体も制限）')}
        {time('releaseTime', '自動解除')}
        <label className="field">待ち時間（秒）<input type="number" min={0} max={600} value={f.waitSeconds} disabled={locked} onChange={(e) => set('waitSeconds', Number(e.target.value))} /></label>
        <label className="field">解除時間（分）<input type="number" min={1} max={180} value={f.unlockMinutes} disabled={locked} onChange={(e) => set('unlockMinutes', Number(e.target.value))} /></label>
        <label className="field">許可する再生リスト（1行に1つ。URL でも ID でも）
          <textarea rows={4} value={f.allowed} disabled={locked} onChange={(e) => set('allowed', e.target.value)} spellCheck={false} />
        </label>
        <div className="row">
          <button
            className="primary"
            disabled={locked}
            onClick={() => save({ guard: { prepareTime: f.prepareTime, level1Time: f.level1Time, level2Time: f.level2Time, releaseTime: f.releaseTime, waitSeconds: f.waitSeconds, unlockMinutes: f.unlockMinutes, allowedPlaylists: lines(f.allowed) } })}
          >
            保存
          </button>
          <span className="sub">{ok}</span>
        </div>
      </div>
    </section>
  );
}

function DigitalForm({ s, act }: { s: AppSettings; act: Act }) {
  const [reduce, setReduce] = useState(s.digital.reduce.join('\n'));
  const [exclude, setExclude] = useState(s.digital.exclude.join('\n'));
  useEffect(() => { setReduce(s.digital.reduce.join('\n')); setExclude(s.digital.exclude.join('\n')); }, [s.digital]);
  const { ok, save } = useSave(act);
  return (
    <section className="card">
      <h2>Digital</h2>
      <div className="form-grid">
        <div className="sub">
          サービス名：{KNOWN_SERVICES.map((c) => `${c}（${serviceLabel(c)}）`).join('、')}。iPhone のアプリは、アプリ名（小文字）で書きます。
        </div>
        <label className="field">減らしたいサービス（1行に1つ）
          <textarea rows={5} value={reduce} onChange={(e) => setReduce(e.target.value)} spellCheck={false} />
        </label>
        <label className="field">除外するサービス（減らしたい時間に含めない）
          <textarea rows={3} value={exclude} onChange={(e) => setExclude(e.target.value)} spellCheck={false} />
        </label>
        <div className="row">
          <button className="primary" onClick={() => save({ digital: { reduce: lines(reduce), exclude: lines(exclude) } })}>保存</button>
          <span className="sub">{ok}</span>
        </div>
      </div>
    </section>
  );
}
