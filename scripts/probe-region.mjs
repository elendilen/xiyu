// 探测指定区域 pooler 连通性（工具脚本）
import pg from 'pg';
const region = process.argv[2];
const url = process.env.DATABASE_URL;
const u = new URL(url);
const REF = u.hostname.replace(/^db\./, '').replace(/\.supabase\.co$/, '');
const PW = decodeURIComponent(u.password);
const candidates = [
  { name: `${region} txn(6543)`, url: `postgresql://postgres.${REF}:${PW}@aws-0-${region}.pooler.supabase.com:6543/postgres` },
  { name: `${region} session(5432)`, url: `postgresql://postgres.${REF}:${PW}@aws-0-${region}.pooler.supabase.com:5432/postgres` },
];
for (const c of candidates) {
  const client = new pg.Client({ connectionString: c.url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  try {
    await client.connect();
    await client.query('select 1');
    console.log(`✅ ${c.name}: 连接成功`);
    await client.end();
    break;
  } catch (e) {
    console.log(`❌ ${c.name}: ${String(e.message).split('\n')[0].slice(0, 120)}`);
    try { await client.end(); } catch {}
  }
}
