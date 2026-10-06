'use client';
import { useState } from 'react';
import { supabase } from '@/lib/client';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    if (error) setError('ログインできませんでした。メールアドレスとパスワードを確認してください。');
    else window.location.href = '/';
  }

  return (
    <main>
      <h1>🌙 Life OS</h1>
      <form onSubmit={submit} className="card" style={{ display: 'grid', gap: 10 }}>
        <input type="email" placeholder="メールアドレス" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="パスワード" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="primary" type="submit">ログイン</button>
        <div className="err">{error}</div>
      </form>
    </main>
  );
}
