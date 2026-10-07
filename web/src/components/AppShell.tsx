'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Today', icon: '🏠' },
  { href: '/study', label: 'Study', icon: '📚' },
  { href: '/tasks', label: 'Tasks', icon: '📝' },
  { href: '/life', label: 'Life', icon: '🌿' },
];

const isActive = (path: string, href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));

/** 下部ナビゲーション（スマホは画面の下、PC は上）。タブは4つだけ */
function BottomNav() {
  const path = usePathname();
  return (
    <nav className="bottom-nav" aria-label="メイン">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={isActive(path, t.href) ? 'on' : ''} aria-current={isActive(path, t.href) ? 'page' : undefined}>
          <span className="icon" aria-hidden>{t.icon}</span>
          <span>{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}

/** 画面の枠：下部ナビ + ヘッダー（タイトルと右上のリンク） + 本文 */
export function AppShell({ title, back, right, children }: { title: string; back?: string; right?: React.ReactNode; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <>
      <BottomNav />
      <main className="shell">
        <header className="page-head">
          <h1>
            {back && (
              <button className="back" onClick={() => router.push(back)} aria-label="戻る">‹</button>
            )}
            {title}
          </h1>
          {right}
        </header>
        {children}
      </main>
    </>
  );
}

/** Today の右上など、目立たない場所に置く Settings への入口 */
export function SettingsLink() {
  return (
    <Link href="/settings" className="gear" aria-label="設定">⚙</Link>
  );
}
