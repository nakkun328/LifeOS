'use client';
import { useRouter } from 'next/navigation';

const INTERACTIVE = 'button,a,input,select,textarea,summary,details,label';

/**
 * 詳細画面へ移動できるカード。カードのどこをタップしても移動する。
 * ただし、中のボタン・入力欄などをタップしたときは、その操作を優先して移動しない。
 */
export function Card({ href, title, children, className = '' }: { href: string; title: string; children: React.ReactNode; className?: string }) {
  const router = useRouter();
  return (
    <section
      className={`card tappable ${className}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
        router.push(href);
      }}
    >
      <h2>
        {title}
        <a href={href} className="chev" aria-label={`${title}の詳細`} onClick={(e) => { e.preventDefault(); router.push(href); }}>›</a>
      </h2>
      {children}
    </section>
  );
}
