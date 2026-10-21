'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseBrowser } from '@/lib/supabaseClient';

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [invite, setInvite] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/home');
  }, [loading, user, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    const supabase = getSupabaseBrowser();

    const { data, error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/home` },
    });

    if (signUpErr) {
      setBusy(false);
      setError(signUpErr.message);
      return;
    }

    // 邮箱已自动确认（有 session）→ 直接建道籍；否则引导用户查收邮件
    if (data.session) {
      const { error: rpcErr } = await supabase.rpc('register_with_invite', {
        p_invite_code: invite || null,
      });
      setBusy(false);
      if (rpcErr) {
        setError(rpcErr.message);
        return;
      }
      router.replace('/home');
    } else {
      setBusy(false);
      setNotice('确认邮件已发送，请查收后登录。登录后即可补全道籍。');
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card stack">
        <div className="logo">曦羽</div>
        <div className="tagline">道侣共修 · 结发长生</div>
        <form className="card stack" onSubmit={onSubmit}>
          <div className="field">
            <label className="label">邮箱</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="field">
            <label className="label">密码</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <div className="field">
            <label className="label">邀请码</label>
            <input
              className="input"
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              placeholder="首位道侣可留空，成为洞主"
            />
          </div>
          {error && <div className="error">{error}</div>}
          {notice && <div className="notice">{notice}</div>}
          <button className="btn btn-gold btn-block" disabled={busy}>
            {busy ? '入道中…' : '入 道'}
          </button>
          <div className="center small muted">
            已有道籍？<Link href="/login">登入</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
