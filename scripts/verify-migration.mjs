// M2 验收：结构检查 + RLS 负向测试（非成员读写拒绝）
// 用法：node --env-file=.env scripts/verify-migration.mjs
import pg from 'pg';

const url = process.env.DATABASE_URL;
const cfg = { connectionString: url, ssl: { rejectUnauthorized: false } };
const client = new pg.Client(cfg);
await client.connect();

try {
  // 1. 表清单 + RLS 状态
  const { rows: tables } = await client.query(
    `select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename`,
  );
  const expected = [
    'anniversaries', 'bottleneck_state', 'breakthroughs', 'checkins',
    'cultivation_events', 'decorations', 'invites', 'letters', 'photos',
    'places', 'profiles', 'settings', 'timeline', 'wishlist',
  ];
  console.log('=== public 表 + RLS 状态 ===');
  for (const t of tables) console.log(`  ${t.tablename.padEnd(20)} RLS=${t.rowsecurity}`);
  const missing = expected.filter((e) => !tables.some((t) => t.tablename === e));
  console.log(missing.length ? `❌ 缺表: ${missing.join(', ')}` : `✅ ${expected.length} 张表齐全`);

  // 2. 函数与 bucket
  const { rows: fns } = await client.query(
    `select proname from pg_proc where proname in ('is_member','is_owner','register_with_invite')`,
  );
  console.log('函数:', fns.map((f) => f.proname).join(', ') || '(无)');
  const { rows: buckets } = await client.query(`select id, public from storage.buckets`);
  console.log('buckets:', buckets.map((b) => `${b.id}(public=${b.public})`).join(', ') || '(无)');

  // 3. 插入测试行（作为 postgres）
  await client.query(`insert into public.settings (id, together_date) values (1, '2024-01-01') on conflict (id) do nothing`);

  // 4. 匿名拒绝
  const anon = new pg.Client(cfg);
  await anon.connect();
  await anon.query(`set role anon`);
  const { rows: anonRows } = await anon.query(`select count(*)::int as n from public.settings`);
  console.log(`anon 读 settings => ${anonRows[0].n} 行（应为 0）`);
  try {
    await anon.query(`insert into public.settings (id) values (2)`);
    console.log('❌ anon 竟然能写 settings');
  } catch (e) {
    console.log('✅ anon 写 settings 被拒:', String(e.message).split('\n')[0]);
  }
  await anon.end();

  // 5. authenticated 非成员拒绝
  const authc = new pg.Client(cfg);
  await authc.connect();
  await authc.query(`set role authenticated`);
  const { rows: authRows } = await authc.query(`select count(*)::int as n from public.settings`);
  console.log(`authenticated(无 profile) 读 settings => ${authRows[0].n} 行（应为 0）`);
  await authc.end();

  // 清理测试行
  await client.query(`delete from public.settings where id = 1`);

  console.log('\n=== 结论 ===');
  console.log('结构检查 + RLS 负向测试完成。成员正向路径将在 M3 端到端验证。');
} finally {
  await client.end();
}
