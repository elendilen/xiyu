// 查看 Supabase auth 配置（邮箱自动确认 / 是否允许注册等）—— 工具脚本
import pg from 'pg';
const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});
await c.connect();
const { rows } = await c.query(`select * from auth.config`);
for (const row of rows) {
  for (const [k, v] of Object.entries(row)) {
    if (v !== null && v !== undefined) {
      console.log(`${k}:`, typeof v === 'object' ? JSON.stringify(v) : v);
    }
  }
}
await c.end();
