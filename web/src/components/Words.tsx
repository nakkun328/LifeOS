'use client';
import Link from 'next/link';
import { useState } from 'react';
import { apiFetch } from '@/lib/client';
import { STATUS_LABEL } from '@/lib/words';
import type { WordsSummary } from '@/lib/words';
import { useApi, type Act } from '@/lib/useApi';
import { AppShell } from './AppShell';

type AddResult = { added: number; skipped: number; invalid: string[] };

/** 1語ずつと、複数行の貼り付け（1行に「単語, 意味」）。テストの対象にも、そのまま入れられる */
function AddWords({ tests, act }: { tests: WordsSummary['tests']; act: Act }) {
  const [word, setWord] = useState('');
  const [meaning, setMeaning] = useState('');
  const [bulk, setBulk] = useState('');
  const [testId, setTestId] = useState('');
  const [result, setResult] = useState<AddResult | null>(null);
  const send = (body: Record<string, unknown>, reset: () => void) =>
    act(async () => {
      setResult(null);
      const r = await apiFetch<AddResult>('/api/words', { body: { ...body, ...(testId ? { test_id: testId } : {}) } });
      setResult(r);
      reset();
    });
  return (
    <div className="form-grid">
      <div className="row">
        <input className="grow" placeholder="単語" value={word} maxLength={80} onChange={(e) => setWord(e.target.value)} />
        <input className="grow" placeholder="意味" value={meaning} maxLength={200} onChange={(e) => setMeaning(e.target.value)} />
        <button className="primary" disabled={!word.trim() || !meaning.trim()} onClick={() => send({ word, meaning }, () => { setWord(''); setMeaning(''); })}>追加</button>
      </div>
      <details>
        <summary className="sub">まとめて貼り付ける</summary>
        <div className="form-grid" style={{ marginTop: 8 }}>
          <textarea className="mono" rows={6} value={bulk} onChange={(e) => setBulk(e.target.value)} spellCheck={false}
            placeholder={'1行に1語。「単語, 意味」の形\napple, りんご\ngive up, あきらめる'} />
          <button className="primary" disabled={!bulk.trim()} onClick={() => send({ bulk }, () => setBulk(''))}>まとめて登録</button>
        </div>
      </details>
      {tests.length > 0 && (
        <label className="field">テストの対象にする（任意）
          <select value={testId} onChange={(e) => setTestId(e.target.value)}>
            <option value="">なし</option>
            {tests.map((t) => <option key={t.id} value={t.id}>{t.name}（{t.due_date}）</option>)}
          </select>
        </label>
      )}
      {result && (
        <div className="sub">
          {result.added}語を追加しました{result.skipped > 0 && `（すでにある ${result.skipped}語は、飛ばしました）`}
          {result.invalid.length > 0 && <div>読み取れなかった行：{result.invalid.join(' ／ ')}</div>}
        </div>
      )}
    </div>
  );
}

/** テスト（名前と期限）を作り、単語をまとめて対象にする */
function Tests({ tests, act }: { tests: WordsSummary['tests']; act: Act }) {
  const [name, setName] = useState('');
  const [due, setDue] = useState('');
  const [scope, setScope] = useState('unassigned');
  return (
    <div>
      {tests.length === 0 && <div className="sub">テストを作ると、期限が近い単語を優先して出します。</div>}
      <ul className="plain">
        {tests.map((t) => (
          <li key={t.id}>
            <span className="grow">
              {t.name}
              <div className="sub">
                {t.days_left >= 0 ? (t.days_left === 0 ? '今日' : `あと${t.days_left}日`) : '期限を過ぎました'}（{t.due_date}）　対象 {t.total}語・未習得 {t.unmastered}語
              </div>
            </span>
            <button onClick={() => act(() => apiFetch(`/api/word-tests/${t.id}/words`, { body: { scope: 'unassigned' } }))}>未設定の単語を足す</button>
          </li>
        ))}
      </ul>
      <div className="form-grid" style={{ marginTop: 10 }}>
        <div className="row">
          <input className="grow" placeholder="テスト名（例：中間テスト）" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="期限" />
        </div>
        <div className="row">
          <select className="grow" value={scope} onChange={(e) => setScope(e.target.value)} aria-label="対象の単語">
            <option value="none">単語は、あとで選ぶ</option>
            <option value="unassigned">テスト未設定の単語すべて</option>
            <option value="unmastered">未習得の単語すべて</option>
          </select>
          <button className="primary" disabled={!name.trim() || !due} onClick={() => act(async () => { await apiFetch('/api/word-tests', { body: { name, due_date: due, scope } }); setName(''); setDue(''); })}>テストを作る</button>
        </div>
      </div>
    </div>
  );
}

/** Study > 英単語：今日の復習、テスト、登録、苦手な単語 */
export function WordsPage() {
  const { data: s, error, act } = useApi<WordsSummary>('/api/words', 30_000);
  if (!s) return <AppShell title="英単語" back="/study"><div className="muted">読み込み中…</div><div className="err">{error}</div></AppShell>;
  return (
    <AppShell title="英単語" back="/study">
      <div className="err">{error}</div>
      <div className="cards">
        <section className="card">
          <h2>今日の復習</h2>
          <div className="lead">{s.dueCount}語</div>
          {s.nextTest && (
            <div className="sub">{s.nextTest.name}　{s.nextTest.days_left === 0 ? '今日' : `あと${s.nextTest.days_left}日`}・未習得 {s.nextTest.unmastered}語</div>
          )}
          <div style={{ marginTop: 10 }}>
            {s.dueCount > 0 ? (
              <Link href="/study/words/review" className="btn primary">復習を始める</Link>
            ) : (
              <div className="sub">{s.total === 0 ? '単語を登録すると、復習が出ます' : '今日の復習は終わりました'}</div>
            )}
          </div>
        </section>

        <section className="card">
          <h2>単語を登録</h2>
          <AddWords tests={s.tests} act={act} />
        </section>

        <section className="card">
          <h2>テスト</h2>
          <Tests tests={s.tests} act={act} />
        </section>

        <section className="card">
          <h2>苦手な単語（{s.weak.length}語）</h2>
          {s.weak.length === 0 ? <div className="sub">いまは、苦手な単語はありません</div> : (
            <ul className="plain">
              {s.weak.slice(0, 30).map((w) => (
                <li key={w.id}><span>{w.word}<div className="sub">{w.meaning}</div></span><span className="sub">誤 {w.wrong_count}／正 {w.correct_count}</span></li>
              ))}
            </ul>
          )}
        </section>

        <section className="card span-all">
          <h2>状態（全 {s.total}語）</h2>
          <div className="seg">
            {(Object.keys(STATUS_LABEL) as Array<keyof typeof STATUS_LABEL>).map((k) => (
              <span key={k} className="badge">{STATUS_LABEL[k]} {s.counts[k]}</span>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
