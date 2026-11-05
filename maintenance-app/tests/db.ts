import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const read = (p: string) => readFileSync(new URL(`../supabase/${p}`, import.meta.url), 'utf8');

export async function setupDb() {
  const db = new PGlite();
  // Supabase가 제공하는 최소 요소를 흉내낸다: 역할, auth.users, auth.uid()
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  await db.exec(read('migrations/0001_init.sql'));
  await db.exec(read('seed.sql'));
  return db;
}

export async function newUser(db: PGlite, p: { role: 'staff' | 'admin'; store?: string; region?: string | null; name?: string }) {
  const id = randomUUID();
  await db.query('insert into auth.users (id) values ($1)', [id]);
  await db.query(
    'insert into public.profiles (id, role, store_id, region_id, name) values ($1,$2,$3,$4,$5)',
    [id, p.role, p.store ?? null, p.region ?? null, p.name ?? p.role],
  );
  return id;
}

/** 해당 사용자로 로그인한 것처럼 쿼리를 실행 (authenticated 역할 + JWT sub) */
export async function as<T>(db: PGlite, uid: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}

export async function asAnon<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false);`);
  try { return await fn(); } finally { await db.exec(`reset role;`); }
}

export async function rejects(p: Promise<unknown>) {
  try { await p; } catch { return true; }
  return false;
}
