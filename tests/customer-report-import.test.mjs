import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {createServer} from 'vite';
test('September reports import once, preserve existing accounts, and reconcile aging',async()=>{
 const pg=new PGlite();const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false}});
 try{
 for(const f of ['001_initial','002_installer_quality','003_account_permissions','004_account_profiles','005_account_theme','006_more_themes','007_customer_records','008_live_operations'])await pg.exec(readFileSync(`supabase/migrations/${f}.sql`,'utf8'));
 const sql=readFileSync('scripts/imports/sept-18-customers.sql','utf8');await pg.exec(sql);
 let rows=(await pg.query('SELECT payload FROM production.jobs')).rows.map(r=>JSON.parse(r.payload));assert.equal(rows.length,86);assert.equal(new Set(rows.map(r=>r.number)).size,86);
 for(const [stage,count,total] of [['Received',36,216933],['Production',18,76192],['Incomplete',32,252674]]){const r=rows.filter(j=>j.stage===stage);assert.equal(r.length,count);assert.equal(r.reduce((s,j)=>s+j.amount,0),total)}
 await pg.exec(readFileSync('FREEDOM-SQUARE-PO.sql','utf8'));await pg.exec(readFileSync('FREEDOM-SQUARE-PO.sql','utf8'));
 const freedom=rows.find(j=>j.number==='620167');assert.equal(freedom.paymentMethod,'PO');assert.equal(freedom.amount,51012);
 const {aging,bonusMetrics}=await vite.ssrLoadModule('/lib/operations.ts');const aged=rows.filter(j=>aging(j,'2026-09-18').aged);assert.equal(aged.length,8);assert.equal(aged.reduce((s,j)=>s+j.amount,0),20242);assert.equal(rows.filter(j=>aging(j,'2026-09-18').missing).length,32);
 assert.equal(rows.find(r=>r.number==='669375').installed,'');assert.equal(rows.find(r=>r.number==='660001').incompleteSince,'');assert.equal(rows.find(r=>r.number==='681554').stage,'Production');
 await pg.query("UPDATE production.jobs SET payload=(payload::jsonb||'{\"customer\":\"Edited name\"}'::jsonb)::text WHERE payload::jsonb->>'number'='660001'");await pg.exec(sql);
 assert.equal((await pg.query('SELECT count(*)::int AS n FROM production.jobs')).rows[0].n,86);assert.equal((await pg.query("SELECT payload::jsonb->>'customer' AS name FROM production.jobs WHERE payload::jsonb->>'number'='660001'")).rows[0].name,'Edited name');
 assert.equal((await pg.query('SELECT count(*)::int AS n FROM production.customer_events')).rows[0].n,86);
 }finally{await vite.close();await pg.close()}
});
