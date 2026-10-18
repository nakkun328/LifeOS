'use client';
import { useEffect, useState } from 'react';
import { parseUntil, safeReturnUrl } from '@/lib/focusBlocked';

const hms = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
};

export default function FocusBlocked() {
  const [left, setLeft] = useState<number | null>(null);
  const [label, setLabel] = useState('');

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const until = parseUntil(q.get('until'));
    const back = safeReturnUrl(q.get('url'));
    setLabel(q.get('set') ?? '');
    if (until === null) return;
    const tick = () => {
      const ms = until - Date.now();
      setLeft(ms);
      if (ms <= 0 && back) window.location.replace(back); // 集中が終わったら、自動で元のページへ
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <main className="narrow" style={{ textAlign: 'center', paddingTop: 80 }}>
      <div style={{ fontSize: 44 }}>🎯</div>
      <h1>集中タイマー中です{label ? `（${label}）` : ''}</h1>
      <p className="muted">この集中が終わるまで、あと</p>
      <div className="big-num" style={{ fontSize: 56 }}>{left === null ? '--:--:--' : hms(left)}</div>
      <p className="muted">終わると、自動で元のページに戻ります。</p>
    </main>
  );
}
