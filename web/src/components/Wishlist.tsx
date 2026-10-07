'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/client';
import type { WishRow } from '@/lib/types';
import { useApi, type Act } from '@/lib/useApi';
import { PRIORITY_NAME } from '@/lib/wishlist';
import { AppShell } from './AppShell';

/** 必須は名前だけ。価格・カテゴリ・URL・Google Docs のリンク・優先度・メモは、すべて任意 */
function WishForm({ act }: { act: Act }) {
  const [name, setName] = useState('');
  const [f, setF] = useState({ price: '', category: '', product_url: '', docs_url: '', priority: '', memo: '' });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div className="form-grid">
      <div className="row">
        <input className="grow" placeholder="欲しい物の名前" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        <button
          className="primary"
          disabled={!name.trim()}
          onClick={() =>
            act(async () => {
              const body: Record<string, unknown> = { name };
              if (f.price.trim()) body.price = Number(f.price);
              if (f.category.trim()) body.category = f.category;
              if (f.product_url.trim()) body.product_url = f.product_url;
              if (f.docs_url.trim()) body.docs_url = f.docs_url;
              if (f.priority) body.priority = Number(f.priority);
              if (f.memo.trim()) body.memo = f.memo;
              await apiFetch('/api/wishlist', { body });
              setName('');
              setF({ price: '', category: '', product_url: '', docs_url: '', priority: '', memo: '' });
            })
          }
        >
          追加
        </button>
      </div>
      <details>
        <summary className="sub">詳細（任意）</summary>
        <div className="form-grid" style={{ marginTop: 8 }}>
          <div className="row">
            <input className="grow" inputMode="numeric" placeholder="価格（円）" value={f.price} onChange={(e) => set('price', e.target.value)} />
            <input className="grow" placeholder="カテゴリ" value={f.category} maxLength={30} onChange={(e) => set('category', e.target.value)} />
            <select value={f.priority} onChange={(e) => set('priority', e.target.value)} aria-label="優先度">
              <option value="">優先度</option><option value="1">高</option><option value="2">中</option><option value="3">低</option>
            </select>
          </div>
          <input type="url" placeholder="商品URL" value={f.product_url} onChange={(e) => set('product_url', e.target.value)} />
          <input type="url" placeholder="Google Docs のリンク" value={f.docs_url} onChange={(e) => set('docs_url', e.target.value)} />
          <input placeholder="メモ" value={f.memo} maxLength={1000} onChange={(e) => set('memo', e.target.value)} />
        </div>
      </details>
    </div>
  );
}

function Item({ w, act }: { w: WishRow; act: Act }) {
  return (
    <li>
      <span className="grow" style={{ opacity: w.purchased ? 0.6 : 1 }}>
        {w.name}
        {w.priority && !w.purchased && <span className="badge">優先 {PRIORITY_NAME[w.priority]}</span>}
        {w.category && <span className="badge">{w.category}</span>}
        <div className="sub">
          {w.price !== null && <span>¥{w.price.toLocaleString('ja-JP')}　</span>}
          {w.product_url && <a href={w.product_url} target="_blank" rel="noopener noreferrer">商品</a>}
          {w.product_url && w.docs_url && '　'}
          {w.docs_url && <a href={w.docs_url} target="_blank" rel="noopener noreferrer">Docs</a>}
        </div>
        {w.memo && <div className="sub">{w.memo}</div>}
      </span>
      <button onClick={() => act(() => apiFetch(`/api/wishlist/${w.id}`, { method: 'PATCH', body: { purchased: !w.purchased } }))}>
        {w.purchased ? '戻す' : '購入済み'}
      </button>
    </li>
  );
}

export function WishlistPage() {
  const { data: items, error, act } = useApi<WishRow[]>('/api/wishlist');
  const open = (items ?? []).filter((w) => !w.purchased);
  const bought = (items ?? []).filter((w) => w.purchased);
  return (
    <AppShell title="Wishlist" back="/life">
      <div className="cards">
        <section className="card span-all">
          <WishForm act={act} />
          <div className="err">{error}</div>
        </section>
        <section className="card">
          <h2>欲しい物（優先度順）</h2>
          {items === null ? <div className="muted">読み込み中…</div> : open.length === 0 ? (
            <div className="sub">まだありません。名前だけで追加できます。</div>
          ) : <ul className="plain">{open.map((w) => <Item key={w.id} w={w} act={act} />)}</ul>}
        </section>
        {bought.length > 0 && (
          <section className="card">
            <h2>購入済み</h2>
            <ul className="plain">{bought.map((w) => <Item key={w.id} w={w} act={act} />)}</ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}
