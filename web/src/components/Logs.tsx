'use client';
import { useApi } from '@/lib/useApi';
import type { LogRow } from '@/lib/types';
import { AppShell } from './AppShell';
import { LogInput } from './LogInput';

/** 一言ログを日付ごとに見返す（決定事項は、別画面） */
export function LogsPage() {
  const { data: logs, error, act } = useApi<LogRow[]>('/api/logs?days=60');
  const byDate = new Map<string, LogRow[]>();
  for (const l of logs ?? []) byDate.set(l.log_date, [...(byDate.get(l.log_date) ?? []), l]);
  return (
    <AppShell title="ログ" back="/life">
      <div className="cards">
        <section className="card span-all">
          <LogInput act={act} />
          <div className="err">{error}</div>
        </section>
        {logs === null ? (
          <div className="muted span-all">読み込み中…</div>
        ) : byDate.size === 0 ? (
          <div className="muted span-all">まだログがありません</div>
        ) : (
          [...byDate.entries()].map(([date, rows]) => (
            <section className="card" key={date}>
              <h2>{date}</h2>
              <ul className="plain">{rows.map((l) => <li key={l.id}><span>{l.body}</span><span className="pill">{l.tag}</span></li>)}</ul>
            </section>
          ))
        )}
      </div>
    </AppShell>
  );
}
