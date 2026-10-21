'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';

export default function Nav() {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const name = profile?.dao_name || profile?.nickname || '道友';

  return (
    <nav className="nav">
      <Link href="/home" className={pathname === '/home' ? 'active' : ''}>
        洞府
      </Link>
      <Link href="/timeline" className={pathname === '/timeline' ? 'active' : ''}>
        修炼史
      </Link>
      <span className="spacer" />
      <span className="muted small" style={{ alignSelf: 'center' }}>
        {name}
      </span>
      <button
        className="btn"
        style={{ padding: '6px 10px', fontSize: '0.85em' }}
        onClick={() => void signOut()}
      >
        出关
      </button>
    </nav>
  );
}
