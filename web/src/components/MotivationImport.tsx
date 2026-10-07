'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/client';
import type { ImportReport } from '@/server/handlers/motivation';

/** 旧「Motivation Monitor」のデータを取り込む。貼り付け → 確認（件数と期間）→ 取り込み。何度実行しても重複しない */
export function MotivationImport() {
  const [text, setText] = useState('');
  const [prefer, setPrefer] = useState<'existing' | 'incoming'>('existing');
  const [preview, setPreview] = useState<ImportReport | null>(null);
  const [done, setDone] = useState<ImportReport | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (dryRun: boolean) => {
    setBusy(true);
    setError('');
    try {
      const r = await apiFetch<ImportReport>('/api/motivation/import', { body: { json: text, prefer, dryRun } });
      if (dryRun) { setPreview(r); setDone(null); } else { setDone(r); setPreview(null); }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      if (dryRun) setPreview(null);
    } finally {
      setBusy(false);
    }
  };
  const reset = () => { setPreview(null); setDone(null); setError(''); };

  return (
    <section className="card span-all">
      <h2>Motivation の取り込み</h2>
      <div className="sub">旧アプリのデータ（<code>{'[{"date": …, "scores": …, "comment": …}, …]'}</code> の形の JSON）を貼り付けます。取り出し方は SETUP.md にあります。</div>
      <textarea
        value={text}
        rows={5}
        placeholder="ここに JSON を貼り付け"
        aria-label="取り込む JSON"
        onChange={(e) => { setText(e.target.value); reset(); }}
        style={{ width: '100%', marginTop: 8, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
      />
      <div className="row" style={{ marginTop: 8 }}>
        <button disabled={busy || !text.trim()} onClick={() => run(true)}>確認する</button>
      </div>
      <div className="err">{error}</div>

      {preview && (
        <div style={{ marginTop: 8 }} role="status">
          <div>
            <b>{preview.validDates}日分</b>を取り込めます
            {preview.period && <>（{preview.period.from} 〜 {preview.period.to}）</>}。
            読み取った行は {preview.total}件。
          </div>
          <div className="sub">
            Life OS にまだない日付：{preview.newDates}日　／　すでにある日付：{preview.overlapDates}日
            {preview.overlapDates > 0 && <>（うち、同じ項目で値が違うもの：{preview.conflicts}項目）</>}
            {preview.duplicateDates > 0 && <>　／　貼り付けの中で同じ日付をまとめた：{preview.duplicateDates}日</>}
          </div>
          {preview.invalidCount > 0 && (
            <div className="banner" role="alert" style={{ marginTop: 8 }}>
              <b>{preview.invalidCount}件</b>は不正なため、取り込みません。
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {preview.invalid.map((x) => <li key={x.index}>{x.index + 1}行目：{x.reason}</li>)}
                {preview.invalidCount > preview.invalid.length && <li>ほか {preview.invalidCount - preview.invalid.length}件</li>}
              </ul>
            </div>
          )}
          {preview.conflicts > 0 && (
            <fieldset style={{ border: 0, padding: 0, margin: '8px 0 0' }}>
              <legend className="sub">同じ項目が両方にあるとき</legend>
              <label style={{ display: 'block' }}><input type="radio" name="prefer" checked={prefer === 'existing'} onChange={() => setPrefer('existing')} /> Life OS の値を残す</label>
              <label style={{ display: 'block' }}><input type="radio" name="prefer" checked={prefer === 'incoming'} onChange={() => setPrefer('incoming')} /> 旧アプリの値を使う</label>
            </fieldset>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <button className="primary" disabled={busy || preview.validDates === 0} onClick={() => run(false)}>取り込む</button>
          </div>
        </div>
      )}

      {done && (
        <div style={{ marginTop: 8 }} role="status">
          <b>取り込みました。</b>新しい日付 {done.created}日、更新 {done.updated}日、変更なし {done.unchanged}日。
          {done.invalidCount > 0 && <> 不正な {done.invalidCount}件は取り込んでいません。</>}
          <div className="sub">同じデータをもう一度取り込んでも、重複しません。</div>
        </div>
      )}
    </section>
  );
}
