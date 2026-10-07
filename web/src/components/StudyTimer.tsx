'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/client';
import { formatDuration } from '@/lib/messages';
import { useNow, type Act } from '@/lib/useApi';

type Subject = { id: string; name: string };
type Active = { id: string; kind: 'study' | 'club'; started_at: string; subject_name: string | null; long_running: boolean };

/**
 * 勉強・部活のタイマー。科目を選んで START、STOP で保存（2タップ）。
 * Today と Study の両方で同じものを使う。振り返り（効率・進捗・メモ）は任意で、スキップできる。
 */
export function StudyTimer({ subjects, active, act }: { subjects: Subject[]; active: Active | null; act: Act }) {
  const now = useNow();
  const [kind, setKind] = useState<'study' | 'club'>('study');
  const [subjectId, setSubjectId] = useState('');
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const chosen = subjectId || subjects[0]?.id || '';

  if (reviewId) return <Review id={reviewId} done={() => setReviewId(null)} act={act} />;

  if (active) {
    return (
      <div>
        <div className="sub">{active.kind === 'club' ? '部活' : (active.subject_name ?? '勉強')} を計測中</div>
        <div className="big-num">{formatDuration((now - Date.parse(active.started_at)) / 1000)}</div>
        {active.long_running && !ack && <div className="sub">3時間を超えました。まだ続けていますか？</div>}
        <div className="row" style={{ marginTop: 8 }}>
          <button
            className="primary big"
            onClick={() => act(async () => { const s = await apiFetch<{ id: string }>('/api/sessions/stop', { body: {} }); setReviewId(s.id); })}
          >
            STOP
          </button>
          {active.long_running && !ack && <button onClick={() => setAck(true)}>続ける</button>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="seg" style={{ marginBottom: 8 }}>
        <button className={kind === 'study' ? 'primary' : ''} onClick={() => setKind('study')}>勉強</button>
        <button className={kind === 'club' ? 'primary' : ''} onClick={() => setKind('club')}>部活</button>
      </div>
      <div className="row">
        {kind === 'study' ? (
          <select className="grow" value={chosen} onChange={(e) => setSubjectId(e.target.value)} aria-label="科目">
            {subjects.length === 0 && <option value="">科目を追加してください（Settings）</option>}
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        ) : <span className="grow sub">部活の時間を計ります</span>}
        <button
          className="primary big"
          disabled={kind === 'study' && !chosen}
          onClick={() => act(() => apiFetch('/api/sessions/start', { body: kind === 'study' ? { kind, subject_id: chosen } : { kind } }))}
        >
          START
        </button>
      </div>
    </div>
  );
}

function Review({ id, done, act }: { id: string; done: () => void; act: Act }) {
  const [efficiency, setEfficiency] = useState<number | null>(null);
  const [progress, setProgress] = useState('');
  const [note, setNote] = useState('');
  return (
    <div>
      <div className="sub" style={{ marginBottom: 6 }}>おつかれさま。ふりかえり（任意）</div>
      <div className="seg" style={{ marginBottom: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} className={efficiency === n ? 'primary' : ''} onClick={() => setEfficiency(n)}>{n}</button>
        ))}
      </div>
      <div className="form-grid">
        <input placeholder="進捗（例：第3章まで）" value={progress} onChange={(e) => setProgress(e.target.value)} />
        <input placeholder="メモ" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="row">
          <button className="primary" onClick={() => act(async () => { await apiFetch(`/api/sessions/${id}`, { method: 'PATCH', body: { efficiency, progress, note } }); done(); })}>保存</button>
          <button onClick={done}>スキップ</button>
        </div>
      </div>
    </div>
  );
}
