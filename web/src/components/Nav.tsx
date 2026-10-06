import Link from 'next/link';

const ITEMS = [
  { href: '/', label: 'Today' },
  { href: '/tasks', label: 'Tasks' },
  { href: '/logs', label: 'Logs' },
];

export function Nav({ current }: { current: string }) {
  return (
    <nav>
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href} className={i.href === current ? 'on' : ''}>{i.label}</Link>
      ))}
    </nav>
  );
}
