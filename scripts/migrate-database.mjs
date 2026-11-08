import postgres from 'postgres';
import {readFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const host = process.env.SUPABASE_DB_HOST;
if (!host || !process.env.SUPABASE_DB_PASSWORD) throw new Error('Set SUPABASE_DB_HOST and SUPABASE_DB_PASSWORD');
const sql = postgres({host, user: process.env.SUPABASE_DB_USER || 'postgres', password: process.env.SUPABASE_DB_PASSWORD, database:'postgres', ssl:'require', max:1, connect_timeout:10});
try {
  await sql`select pg_advisory_lock(78210611)`;
  {
    const tx = sql;
    await tx`create schema if not exists writer_migrations`;
    await tx`create table if not exists writer_migrations.applied (name text primary key, sha256 text not null, applied_at timestamptz not null default now())`;
    const applied = new Map((await tx`select name, sha256 from writer_migrations.applied`).map(r => [r.name,r.sha256]));
    for (const name of (await readdir('supabase/migrations')).filter(n => n.endsWith('.sql')).sort()) {
      const body = await readFile('supabase/migrations/'+name, 'utf8');
      const hash = createHash('sha256').update(body).digest('hex');
      if (applied.has(name)) { if (applied.get(name) !== hash) throw new Error('Changed applied migration: '+name); continue; }
      const statement = body.replace(/^begin;\s*/i, "").replace(/\s*commit;\s*$/i, "");
      await sql.begin(async migration => {
        await migration.unsafe(statement);
        await migration`insert into writer_migrations.applied (name, sha256) values (${name},${hash})`;
      });
      console.log('Applied', name);
    }
    await tx`notify pgrst, 'reload schema'`;
  }
} finally { await sql.end(); }
