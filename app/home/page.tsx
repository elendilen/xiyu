'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseBrowser } from '@/lib/supabaseClient';
import { computeCultivation, type SourceType } from '@/lib/cultivation';
import { daysTogether, localToday, nextAnniversary } from '@/lib/dates';
import type { CultivationEventRow, Settings } from '@/lib/types';

export default function HomePage() {
  const router = useRouter();
  const { user, profile, loading, refreshProfile } = useAuth();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [events, setEvents] = useState<CultivationEventRow[]>([]);
  const [todayCheckins, setTodayCheckins] = useState(0);
  const [iCheckedIn, setICheckedIn] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  const [dateStr, setDateStr] = useState('');
  const [checkinContent, setCheckinContent] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const today = localToday();

  const loadData = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    const [{ data: s }, { data: ev }, { data: ci }] = await Promise.all([
      supabase.from('settings').select('*').eq('id', 1).maybeSingle(),
      supabase
        .from('cultivation_events')
        .select('*')
        .eq('scope', 'couple')
        .eq('revoked', false),
      supabase.from('checkins').select('author_id').eq('date', today).eq('is_first', true),
    ]);
    setSettings((s as Settings) ?? null);
    setEvents((ev as CultivationEventRow[]) ?? []);
    const authors = (ci as { author_id: string }[]) ?? [];
    setTodayCheckins(authors.length);
    setICheckedIn(authors.some((c) => c.author_id === user?.id));
    setLoadingData(false);
  }, [today, user?.id]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!profile) return; // 登录但无道籍 → 显示完善道籍
    void loadData();
  }, [loading, user, profile, loadData, router]);

  async function completeReg(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.rpc('register_with_invite', {
      p_invite_code: inviteCode || null,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    await refreshProfile();
  }

  async function saveDate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const supabase = getSupabaseBrowser();
    const { error } = await supabase
      .from('settings')
      .upsert({ id: 1, together_date: dateStr });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDateStr('');
    await loadData();
  }

  async function doCheckin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.rpc('do_checkin', { p_content: checkinContent || '' });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setCheckinContent('');
    setNotice('打卡成功，修为已入账。');
    await loadData();
  }

  if (loading) {
    return <div className="container center muted">加载中…</div>;
  }
  if (!user) return null; // 正在跳转登录

  if (!profile) {
    return (
      <div className="container">
        <Nav />
        <div className="card stack">
          <h2>完善道籍</h2>
          <p className="muted small">
            邮箱已认证，还需加入洞府。首位道侣留空邀请码即可成为洞主。
          </p>
          <form className="stack" onSubmit={completeReg}>
            <div className="field">
              <label className="label">邀请码</label>
              <input
                className="input"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="可留空（首位道侣）"
              />
            </div>
            {error && <div className="error">{error}</div>}
            <button className="btn btn-gold btn-block" disabled={busy}>
              {busy ? '入道中…' : '入 道'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const cultivation = settings?.together_date
    ? computeCultivation({
        startDate: settings.together_date,
        realmType: 'mortal',
        events: events.map((e) => ({
          id: e.id,
          sourceType: e.source_type as SourceType,
          sourceId: e.source_id,
          value: e.value,
          occurredAt: e.occurred_at,
          revoked: e.revoked,
        })),
        bottleneck: null,
        today,
      })
    : null;

  const days = settings?.together_date ? daysTogether(settings.together_date, today) : 0;
  const anniv = settings?.together_date ? nextAnniversary(settings.together_date, today) : null;

  return (
    <div className="container">
      <Nav />
      <div className="stack">
        <header>
          <h1>洞府</h1>
          <div className="muted small">
            {profile.dao_name || profile.nickname || '道友'} 的道侣洞府
          </div>
        </header>

        {error && <div className="error">{error}</div>}
        {notice && <div className="notice">{notice}</div>}

        {!settings?.together_date ? (
          <div className="card stack">
            <h2>定下结发之日</h2>
            <p className="muted small">你们是哪一天在一起的？这一天是时间修为的起点。</p>
            <form className="stack" onSubmit={saveDate}>
              <div className="field">
                <label className="label">在一起日期</label>
                <input
                  className="input"
                  type="date"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  required
                />
              </div>
              {error && <div className="error">{error}</div>}
              <button className="btn btn-gold btn-block" disabled={busy}>
                {busy ? '结发中…' : '结 发'}
              </button>
            </form>
          </div>
        ) : (
          <>
            <div className="card realm-panel">
              <div className="substage">
                {cultivation?.realm.type === 'mortal' ? '凡人境' : '仙人境'} ·{' '}
                {cultivation?.subStage}
              </div>
              <div className="realm-name">{cultivation?.realm.name}</div>
              <div className="realm-meaning">{cultivation?.realm.meaning}</div>
              <div className="progress">
                <div
                  className="progress-bar"
                  style={{ width: `${(cultivation?.progress ?? 0) * 100}%` }}
                />
              </div>
              <div className="muted small">
                距下一小阶约 {Math.round((1 - (cultivation?.progress ?? 0)) * 100)}%
              </div>
            </div>

            <div className="card">
              <div className="stats">
                <div className="stat">
                  <div className="num">{cultivation?.effectiveTotal ?? 0}</div>
                  <div className="cap">修为</div>
                </div>
                <div className="stat">
                  <div className="num">{cultivation?.timeValue ?? 0}</div>
                  <div className="cap">时间修为</div>
                </div>
                <div className="stat">
                  <div className="num">{cultivation?.eventValue ?? 0}</div>
                  <div className="cap">事件修为</div>
                </div>
              </div>
              <div className="divider" />
              <div className="between">
                <div>
                  <div className="muted small">在一起</div>
                  <div style={{ fontSize: '1.3em', color: 'var(--gold)' }}>{days} 天</div>
                </div>
                <div className="center">
                  <div className="muted small">下一个纪念日</div>
                  <div style={{ fontSize: '1.1em' }}>{anniv?.date}</div>
                  <div className="muted small">还有 {anniv?.daysLeft} 天</div>
                </div>
              </div>
            </div>

            <div className="card stack">
              <div className="between">
                <h2>传音入密</h2>
                <span className="muted small">今日 {todayCheckins} 人已打卡</span>
              </div>
              {iCheckedIn ? (
                <div className="notice">今日已打卡，明日再续仙缘。</div>
              ) : (
                <form className="stack" onSubmit={doCheckin}>
                  <textarea
                    className="input"
                    placeholder="今日一句，说与道侣听…（可留空）"
                    value={checkinContent}
                    onChange={(e) => setCheckinContent(e.target.value)}
                  />
                  <button className="btn btn-gold btn-block" disabled={busy}>
                    {busy ? '传音中…' : '打卡 · +5 修为'}
                  </button>
                </form>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
