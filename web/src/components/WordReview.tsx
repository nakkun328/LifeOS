'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client';
import type { QueueItem } from '@/lib/words';
import { STATUS_LABEL } from '@/lib/words';
import { AppShell } from './AppShell';

/**
 * 復習：単語を表示 → タップで意味 → 「覚えてた」「忘れてた」の2択。
 * 結果は、1語ごとにすぐ保存する（途中でやめても、そこまでは残る）。
 */
export function WordReview() {
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState({ known: 0, forgot: 0 });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setQueue(await apiFetch<QueueItem[]>('/api/words/queue?limit=30'));
      setI(0);
      setShown(false);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const answer = async (result: 'known' | 'forgot') => {
    if (!queue || busy) return;
    setBusy(true);
    try {
      await apiFetch('/api/words/review', { body: { word_id: queue[i]!.id, result } });
      setDone((d) => ({ ...d, [result]: d[result] + 1 }));
      setI((n) => n + 1);
      setShown(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const total = queue?.length ?? 0;
  const w = queue?.[i];
  const finished = queue !== null && i >= total;
  return (
    <AppShell title="復習" back="/study/words">
      <div className="err">{error}</div>
      <section className="card" style={{ maxWidth: 560 }}>
        {queue === null ? (
          <div className="muted">読み込み中…</div>
        ) : finished ? (
          <div>
            <div className="lead">{done.known + done.forgot === 0 ? '今日の復習は終わりました' : 'おつかれさま'}</div>
            {done.known + done.forgot > 0 && <div className="sub">覚えてた {done.known}語 ／ 忘れてた {done.forgot}語</div>}
            <div className="row" style={{ marginTop: 12 }}>
              <button className="primary" onClick={() => void load()}>続きがあるか確認する</button>
              <Link href="/study/words" className="btn">戻る</Link>
            </div>
          </div>
        ) : (
          <div className="form-grid">
            <div className="progress"><span style={{ width: `${Math.round((i / total) * 100)}%` }} /></div>
            <div className="sub">{i + 1} / {total}　{STATUS_LABEL[w!.status]}{w!.test_name ? `　${w!.test_name}` : ''}</div>
            <div className="flash" onClick={() => setShown(true)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShown(true); }}>
              <div className="word">{w!.word}</div>
              {shown ? <div className="meaning">{w!.meaning}</div> : <div className="hint">タップで意味を表示</div>}
            </div>
            <div className="row">
              <button className="primary big grow" disabled={!shown || busy} onClick={() => void answer('known')}>覚えてた</button>
              <button className="big grow" disabled={!shown || busy} onClick={() => void answer('forgot')}>忘れてた</button>
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
