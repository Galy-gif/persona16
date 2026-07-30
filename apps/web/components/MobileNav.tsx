'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChatCircleDots, Sparkle, UserCircle } from '@phosphor-icons/react';

const ITEMS = [
  { href: '/', label: '人物', icon: Sparkle },
  { href: '/conversations', label: '对话', icon: ChatCircleDots },
  { href: '/me', label: '我的', icon: UserCircle },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="mobile-nav" aria-label="主要导航">
      {ITEMS.map((item) => {
        const active = item.href === '/' ? pathname === '/' || pathname.startsWith('/characters/') : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
            <Icon size={20} weight={active ? 'fill' : 'light'} aria-hidden />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
