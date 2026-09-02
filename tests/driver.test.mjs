// Covers db/raw.ts: the real postgres.js driver that talks to Supabase's transaction
// pooler. tests/postgres.test.mjs stubs this module out, so without this file the
// prepare:false / unsafe() / begin() wiring and its affected-row counts are untested.
//
// Needs a throwaway PostgreSQL database:
//   createdb driver_test
//   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/driver_test npm run test:driver
// Skipped automatically when TEST_DATABASE_URL is unset. Never point this at a
// database holding real jobs or accounts: it creates and drops the production schema.
//
// The npm script passes --test-force-exit because database() caches its postgres.js
// pool in a module-level singleton with no exported way to close it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import postgres from 'postgres';

const url = process.env.TEST_DATABASE_URL;
const ssl = process.env.TEST_DATABASE_SSL ?? 'disable';

test('db/raw.ts driver against a real PostgreSQL server', {skip: url ? false : 'set TEST_DATABASE_URL to run'}, async t => {
  process.env.DATABASE_URL = url;
  process.env.DATABASE_SSL = ssl;

  // Schema setup runs on its own connection: compileQuery would rewrite the
  // migration's own `production.jobs` into `production.production.jobs`.
  const admin = postgres(url, {prepare: false, max: 1, ssl: ssl === 'disable' ? false : ssl});
  const rebuild = async () => {
    await admin.unsafe('DROP SCHEMA IF EXISTS production CASCADE');
    await admin.unsafe(readFileSync('supabase/migrations/001_initial.sql', 'utf8'));
  };

  const vite = await createServer({configFile: false, resolve: {alias: {'@': resolve('.')}},
    server: {middlewareMode: true, hmr: false}, logLevel: 'error'});
  const {database} = await vite.ssrLoadModule('/db/raw.ts');
  const db = database();

  await rebuild();
  t.after(async () => {
    await admin.unsafe('DROP SCHEMA IF EXISTS production CASCADE');
    await admin.end();
    await vite.close();
  });

  await t.test('reports affected rows for writes', async () => {
    const inserted = await db.prepare('INSERT INTO members (id,email,name,role,active) VALUES (?,?,?,?,1)')
      .bind('m1', 'a@example.com', 'A', 'admin').run();
    assert.equal(inserted.meta.changes, 1);
    assert.equal((await db.prepare('SELECT email FROM members WHERE id=?').bind('m1').first()).email, 'a@example.com');
    assert.equal((await db.prepare('UPDATE members SET name=? WHERE id=?').bind('B', 'm1').run()).meta.changes, 1);
    // A zero count is what every optimistic-concurrency check in the app keys on.
    assert.equal((await db.prepare('UPDATE members SET name=? WHERE id=?').bind('B', 'absent').run()).meta.changes, 0);
  });

  await t.test('conditional INSERT ... SELECT reports whether the guard matched', async () => {
    const claim = () => db.prepare('INSERT INTO credentials (member_id,password_hash,must_change,temporary_expires,generation) SELECT ?,?,1,?,1 FROM members WHERE id=? ON CONFLICT DO NOTHING')
      .bind('m1', 'hash', Date.now(), 'm1').run();
    assert.equal((await claim()).meta.changes, 1);
    // Single-use temporary passwords and duplicate report submissions rely on this 0.
    assert.equal((await claim()).meta.changes, 0);
  });

  await t.test('ON CONFLICT DO UPDATE resolves the schema-qualified target', async () => {
    // compileQuery rewrites login_limits to production.login_limits inside the
    // DO UPDATE expression, so the sign-in rate limiter depends on this resolving.
    const now = Date.now();
    const hit = () => db.prepare('INSERT INTO login_limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN login_limits.expires<? THEN 1 ELSE login_limits.count+1 END,expires=CASE WHEN login_limits.expires<? THEN excluded.expires ELSE login_limits.expires END')
      .bind('k1', now + 60000, now, now).run();
    await hit(); await hit();
    assert.equal(Number((await db.prepare('SELECT count FROM login_limits WHERE key=?').bind('k1').first()).count), 2);
  });

  await t.test('batch runs in one transaction and rolls back completely', async () => {
    await assert.rejects(db.batch([
      db.prepare('INSERT INTO members (id,email,name,role,active) VALUES (?,?,?,?,1)').bind('m2', 'b@example.com', 'B', 'admin'),
      db.prepare('INSERT INTO members (id,email,name,role,active) VALUES (?,?,?,?,1)').bind('m1', 'dup@example.com', 'D', 'admin'),
    ]));
    assert.equal(await db.prepare('SELECT id FROM members WHERE id=?').bind('m2').first(), null);

    const results = await db.batch([
      db.prepare('INSERT INTO members (id,email,name,role,active) VALUES (?,?,?,?,1)').bind('m3', 'c@example.com', 'C', 'supervisor'),
      db.prepare('UPDATE members SET name=? WHERE id=?').bind('C2', 'm3'),
    ]);
    assert.deepEqual(results.map(r => r.meta.changes), [1, 1]);
    assert.equal((await db.prepare('SELECT name FROM members WHERE id=?').bind('m3').first()).name, 'C2');
  });

  await t.test('jsonb payload reads and installer reassignment', async () => {
    await db.prepare('INSERT INTO jobs (id,payload,version,updated) VALUES (?,?,1,?)')
      .bind('j1', JSON.stringify({installerId: 'm3', install: '2026-09-10', stage: 'Production'}), 't').run();
    const listed = await db.prepare("SELECT payload,version FROM jobs WHERE (payload::jsonb->>'installerId')=? ORDER BY (payload::jsonb->>'install')").bind('m3').all();
    assert.equal(listed.results.length, 1);

    const moved = await db.prepare("UPDATE jobs SET payload=(payload::jsonb || jsonb_build_object('supervisorId',?::text,'supervisor',?::text,'crew',?::text))::text,version=version+1,updated=? WHERE (payload::jsonb->>'installerId')=?")
      .bind('s1', 'Sup', 'Crew', 't2', 'm3').run();
    assert.equal(moved.meta.changes, 1);
    const payload = JSON.parse((await db.prepare('SELECT payload FROM jobs WHERE id=?').bind('j1').first()).payload);
    assert.equal(payload.supervisor, 'Sup');
    assert.equal(payload.stage, 'Production', 'the jsonb merge must preserve untouched fields');
  });

  await t.test('count(*)::integer comes back as a JS number', async () => {
    // The pending-upload limiter compares this with >=, so a bigint string would break it.
    const row = await db.prepare("SELECT count(*)::integer AS count FROM attachment_uploads WHERE member_id=? AND status='pending' AND expires>?").bind('m1', 0).first();
    assert.equal(typeof row.count, 'number');
    assert.equal(row.count, 0);
  });

  await db.prepare('DROP SCHEMA IF EXISTS production CASCADE').run();
});
