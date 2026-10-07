'use client';
import { useEffect, useState } from 'react';
import { useApi } from '@/lib/useApi';
import type { LogRow } from '@/lib/types';
import { AppShell } from './AppShell';
import { LogInput } from './LogInput';

/** 部活の決定事項。キーワードで検索できる。入力は、ログの入力欄を「決定事項」に切り替えるだけ */
export function DecisionsPage() {
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setApplied(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);
  const { data: rows, error, act } = useApi<LogRow[]>(`/api/decisions?q=${encodeURIComponent(applied)}`);

  return (
    <AppShell title="決定事項" back="/life">
      <div className="cards">
        <section className="card span-all">
          <LogInput act={act} initialKind="decision" />
          <div className="err">{error}</div>
        </section>
        <section className="card span-all">
          <input
            type="search"
            placeholder="キーワードで探す（件名・本文）"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: '100%' }}
            aria-label="検索"
          />
        </section>
        {rows === null ? (
          <div className="muted span-all">読み込み中…</div>
        ) : rows.length === 0 ? (
          <div className="muted span-all">{applied ? '見つかりませんでした' : 'まだ決定事項がありません'}</div>
        ) : (
          rows.map((r) => (
            <section className="card" key={r.id}>
              <h2>{r.log_date}{r.title && <span className="badge">{r.title}</span>}</h2>
              <div>{r.body}</div>
            </section>
          ))
        )}
      </div>
    </AppShell>
  );
}
