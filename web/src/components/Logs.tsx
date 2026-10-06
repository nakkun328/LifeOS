'use client';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch } from '@/lib/client';
import type { LogRow, LogTag } from '@/lib/types';
import { Nav } from './Nav';

const TAGS: LogTag[] = ['趣味', '部活', '日記'];
type Act = (fn: () => Promise<unknown>) => Promise<void>;

/** 1行 + タグだけ。Today から直接使う */
export function LogForm({ act }: { act: Act }) {
  const [tag, setTag] = useState<LogTag>('日記');
  const [body, setBody] = useState('');
  const submit = () => act(async () => { await apiFetch('/api/logs', { body: { tag, body } }); setBody(''); });
  return (
    <div className="row">
      <select value={tag} onChange={(e) => setTag(e.target.value as LogTag)}>
        {TAGS.map((t) => <option key={t}>{t}</option>)}
      </select>
      <input className="grow" placeholder="一言ログ" value={body} maxLength={200}
        onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && body.trim()) void submit(); }} />
      <button className="primary" disabled={!body.trim()} onClick={submit}>記録</button>
    </div>
  );
}

export function LogsCard({ logs, act }: { logs: LogRow[]; act: Act }) {
  return (
    <section className="card">
      <h2>一言ログ<a href="/logs" style={{ float: 'right', fontSize: 12 }}>見返す</a></h2>
      <LogForm act={act} />
      <ul className="plain" style={{ marginTop: 8 }}>
        {logs.map((l) => <li key={l.id}><span>{l.body}</span><span className="pill">{l.tag}</span></li>)}
      </ul>
    </section>
  );
}

export function LogsPage() {
  const [logs, setLogs] = useState<LogRow[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setLogs(await apiFetch<LogRow[]>('/api/logs?days=60'));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) window.location.href = '/login';
      else setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const act: Act = async (fn) => {
    try { await fn(); setError(''); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    await load();
  };

  const byDate = new Map<string, LogRow[]>();
  for (const l of logs ?? []) byDate.set(l.log_date, [...(byDate.get(l.log_date) ?? []), l]);
  return (
    <main>
      <Nav current="/logs" />
      <h1>一言ログ</h1>
      <div className="cards">
      <section className="card span-all"><LogForm act={act} /><div className="err">{error}</div></section>
      {logs === null ? <div className="muted span-all">読み込み中…</div> : byDate.size === 0 ? <div className="muted span-all">まだログがありません</div> : (
        [...byDate.entries()].map(([date, rows]) => (
          <section className="card" key={date}>
            <h2>{date}</h2>
            <ul className="plain">{rows.map((l) => <li key={l.id}><span>{l.body}</span><span className="pill">{l.tag}</span></li>)}</ul>
          </section>
        ))
      )}
      </div>
    </main>
  );
}
