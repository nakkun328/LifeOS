'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/client';
import type { Act } from '@/lib/useApi';
import type { LogTag } from '@/lib/types';

const TAGS: LogTag[] = ['趣味', '部活', '日記'];

/**
 * 一言ログの入力欄。種別を切り替えるだけで、部活の決定事項も同じ欄から残せる（別のフォームは作らない）。
 *  - ログ    ：タグ + 1行 → 保存
 *  - 決定事項：件名（任意）+ 本文 → 保存（タグは部活）
 */
export function LogInput({ act, initialKind = 'log' }: { act: Act; initialKind?: 'log' | 'decision' }) {
  const [kind, setKind] = useState<'log' | 'decision'>(initialKind);
  const [tag, setTag] = useState<LogTag>('日記');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const save = () =>
    act(async () => {
      await apiFetch('/api/logs', { body: kind === 'decision' ? { kind, title, body } : { kind, tag, body } });
      setBody('');
      setTitle('');
    });
  return (
    <div className="form-grid">
      <div className="seg">
        <button className={kind === 'log' ? 'primary' : ''} onClick={() => setKind('log')}>一言ログ</button>
        <button className={kind === 'decision' ? 'primary' : ''} onClick={() => setKind('decision')}>決定事項</button>
      </div>
      {kind === 'decision' && (
        <input placeholder="件名（任意。例：文化祭2027）" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
      )}
      <div className="row">
        {kind === 'log' && (
          <select value={tag} onChange={(e) => setTag(e.target.value as LogTag)} aria-label="タグ">
            {TAGS.map((t) => <option key={t}>{t}</option>)}
          </select>
        )}
        <input
          className="grow"
          placeholder={kind === 'decision' ? '決まったこと' : '一言'}
          value={body}
          maxLength={kind === 'decision' ? 500 : 200}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && body.trim()) void save(); }}
        />
        <button className="primary" disabled={!body.trim()} onClick={save}>保存</button>
      </div>
    </div>
  );
}
