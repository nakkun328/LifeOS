'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/client';
import { useApi } from '@/lib/useApi';

type Subject = { id: string; name: string };

/** 科目の追加・名前の変更・一覧から外す（記録は残る）。Night Guard に関係しないので、制限中でも変更できる */
export function SubjectManager() {
  const { data: subjects, error, act } = useApi<Subject[]>('/api/subjects');
  const [name, setName] = useState('');
  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <input className="grow" placeholder="新しい科目" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        <button disabled={!name.trim()} onClick={() => act(async () => { await apiFetch('/api/subjects', { body: { name } }); setName(''); })}>追加</button>
      </div>
      <ul className="plain">
        {(subjects ?? []).map((s) => (
          <li key={s.id}>
            <span>{s.name}</span>
            <span className="row">
              <button onClick={() => { const n = window.prompt('科目名', s.name); if (n?.trim()) void act(() => apiFetch(`/api/subjects/${s.id}`, { method: 'PATCH', body: { name: n } })); }}>名前変更</button>
              <button onClick={() => { if (window.confirm(`「${s.name}」を一覧から外しますか？（記録は残ります）`)) void act(() => apiFetch(`/api/subjects/${s.id}`, { method: 'PATCH', body: { archived: true } })); }}>外す</button>
            </span>
          </li>
        ))}
      </ul>
      <div className="err">{error}</div>
    </div>
  );
}
