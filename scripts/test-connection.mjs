import pg from 'pg';

const url = process.env.DATABASE_URL;
const u = new URL(url);
const REF = u.hostname.replace(/^db\./, '').replace(/\.supabase\.co$/, '');
const PW = decodeURIComponent(u.password);

const regions = ['us-east-1', 'us-west-1', 'ap-southeast-1', 'ap-northeast-1', 'ap-southeast-2', 'eu-central-1'];
const candidates = [];
for (const r of regions) {
  candidates.push({ name: `${r} txn(6543)`, url: `postgresql://postgres.${REF}:${PW}@aws-0-${r}.pooler.supabase.com:6543/postgres` });
  candidates.push({ name: `${r} session(5432)`, url: `postgresql://postgres.${REF}:${PW}@aws-0-${r}.pooler.supabase.com:5432/postgres` });
}
candidates.push({ name: 'direct(5432)', url });

for (const c of candidates) {
  const client = new pg.Client({ connectionString: c.url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 7000 });
  try {
    await client.connect();
    await client.query('select 1');
    console.log(`✅ ${c.name}: 连接成功`);
    await client.end();
    break;
  } catch (e) {
    console.log(`❌ ${c.name}: ${String(e.message).split('\n')[0].slice(0, 100)}`);
    try { await client.end(); } catch {}
  }
}
