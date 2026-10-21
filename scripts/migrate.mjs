// 执行 Supabase 迁移（工具脚本，非应用代码）
// 用法：node --env-file=.env scripts/migrate.mjs <sql文件>
import { readFileSync } from 'node:fs';
import pg from 'pg';

const file = process.argv[2];
const url = process.env.DATABASE_URL;
if (!file) {
  console.error('用法: node --env-file=.env scripts/migrate.mjs <sql文件>');
  process.exit(1);
}
if (!url) {
  console.error('缺少 DATABASE_URL（请在 .env 配置）');
  process.exit(1);
}

const sql = readFileSync(file, 'utf8');
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  console.log(`✅ 已执行 ${file}（${sql.length} 字节）`);
} finally {
  await client.end();
}
