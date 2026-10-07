'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client';
import { useApi } from '@/lib/useApi';
import type { JournalListItem, JournalView } from '@/server/handlers/journal';
import { AppShell } from './AppShell';

const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];
const label = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return `${m}月${d}日（${WEEKDAY[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]}）`;
};

/** 日記。データのある日は自動で出る。手で直すと、その日は自動で上書きされない */
export function JournalPage() {
  const [date, setDate] = useState('today');
  const { data: j, error, act } = useApi<JournalView>(`/api/journal/${date}`, date === 'today' ? 60_000 : 0);
  const { data: list, reload: reloadList } = useApi<JournalListItem[]>('/api/journal?days=14');
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  useEffect(() => setEditing(false), [date]);

  const go = (d: string) => setDate(d);
  const save = () =>
    act(async () => {
      await apiFetch(`/api/journal/${j!.date}`, { method: 'PUT', body: { body: text } });
      setEditing(false);
      await reloadList();
    });
  const reset = () =>
    act(async () => {
      await apiFetch(`/api/journal/${j!.date}`, { method: 'DELETE' });
      setEditing(false);
      await reloadList();
    });

  return (
    <AppShell title="日記" back="/life">
      <div className="cards">
        <section className="card span-all">
          <div className="row">
            <button onClick={() => j && go(j.prev)} disabled={!j} aria-label="前の日">‹ 前の日</button>
            <h2 className="grow" style={{ textAlign: 'center', margin: 0 }}>
              {j ? label(j.date) : '…'}
              {j?.inProgress && <span className="badge">今日</span>}
              {j?.edited && <span className="badge">編集済み</span>}
            </h2>
            <button onClick={() => j?.next && go(j.next)} disabled={!j?.next} aria-label="次の日">次の日 ›</button>
          </div>
          <div className="err">{error}</div>
          {j === null ? (
            <div className="muted">読み込み中…</div>
          ) : editing ? (
            <div className="form-grid" style={{ marginTop: 8 }}>
              <textarea value={text} rows={8} maxLength={5000} onChange={(e) => setText(e.target.value)} style={{ width: '100%' }} aria-label="日記の本文" />
              <div className="row">
                <button className="primary" onClick={save}>保存</button>
                <button onClick={() => setEditing(false)}>やめる</button>
              </div>
            </div>
          ) : (
            <>
              {j.body.trim() ? (
                <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0' }}>{j.body}</p>
              ) : (
                <div className="sub" style={{ margin: '8px 0' }}>この日はまだ記録がありません。勉強やログを残すと、ここに日記ができます。</div>
              )}
              {j.inProgress && j.body.trim() && !j.edited && <div className="sub">今日の分は、開くたびにその時点のデータで作り直します。</div>}
              <div className="row" style={{ marginTop: 8 }}>
                <button onClick={() => { setText(j.body); setEditing(true); }}>{j.body.trim() ? '編集' : '自分で書く'}</button>
                {j.edited && <button onClick={reset}>自動の文章に戻す</button>}
              </div>
            </>
          )}
        </section>
        <section className="card span-all">
          <h2>最近の日記</h2>
          {list === null ? <div className="muted">読み込み中…</div> : list.length === 0 ? (
            <div className="sub">まだありません。</div>
          ) : (
            <ul className="plain">
              {list.map((it) => (
                <li key={it.date}>
                  <button className="grow" style={{ textAlign: 'left' }} onClick={() => { go(it.date); window.scrollTo({ top: 0 }); }}>
                    <b>{label(it.date)}</b>{it.edited && <span className="badge">編集済み</span>}
                    <div className="sub" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.preview}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
