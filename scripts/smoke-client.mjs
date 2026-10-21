// 冒烟：supabase-js + publishable key（只读，不创建用户）
import { createClient } from '@supabase/supabase-js';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await c.from('settings').select('id').eq('id', 1);
console.log('settings.select =>', JSON.stringify({ data, error: error ? error.message : null }));
const { data: anon, error: anonErr } = await c.auth.getSession();
console.log('auth.getSession =>', JSON.stringify({ session: anon?.session ?? null, error: anonErr ? anonErr.message : null }));
console.log('✅ supabase-js + publishable key 正常');
