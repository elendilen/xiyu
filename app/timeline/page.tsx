'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseBrowser } from '@/lib/supabaseClient';
import { localToday } from '@/lib/dates';
import type { TimelineRow } from '@/lib/types';

export default function TimelinePage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [items, setItems] = useState<TimelineRow[]>([]);
  const [date, setDate] = useState(localToday());
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    const { data } = await supabase
      .from('timeline')
      .select('*')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });
    setItems((data as TimelineRow[]) ?? []);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    void load();
  }, [loading, user, router, load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.from('timeline').insert({
      date,
      title,
      description,
      location: location || '',
      type: 'event',
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setTitle('');
    setDescription('');
    setLocation('');
    await load();
  }

  if (loading || !user) {
    return <div className="container center muted">加载中…</div>;
  }

  return (
    <div className="container">
      <Nav />
      <div className="stack">
        <header>
          <h1>修炼史</h1>
          <div className="muted small">我们的时间节点</div>
        </header>

        {error && <div className="error">{error}</div>}

        <form className="card stack" onSubmit={add}>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label className="label">日期</label>
              <input
                className="input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label className="label">地点</label>
              <input
                className="input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="可留空"
              />
            </div>
          </div>
          <div className="field">
            <label className="label">标题</label>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="例如：第一次见面"
            />
          </div>
          <div className="field">
            <label className="label">描述</label>
            <textarea
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="可留空"
            />
          </div>
          <button className="btn btn-gold btn-block" disabled={busy}>
            {busy ? '记录中…' : '记一笔'}
          </button>
        </form>

        <div className="card">
          {items.length === 0 ? (
            <div className="center muted small">还没有节点，写下第一个吧。</div>
          ) : (
            <div className="timeline-list">
              {items.map((it) => (
                <div className="timeline-item" key={it.id}>
                  <div className="timeline-date">
                    {it.date}
                    {it.location ? ` · ${it.location}` : ''}
                  </div>
                  <div className="timeline-title">{it.title}</div>
                  {it.description && <div className="muted small">{it.description}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
