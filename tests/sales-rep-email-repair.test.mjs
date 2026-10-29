import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {correctSalesRepEmail} from '../scripts/correct-sales-rep-email.mjs';

test('targeted email repair verifies matching jobs, preserves others and applies only once',async()=>{
 const db=new PGlite();
 try{
  await db.exec('CREATE SCHEMA production; CREATE TABLE production.jobs(id text PRIMARY KEY,payload text,version int,updated text); CREATE TABLE production.operations_config(id text PRIMARY KEY,payload text,updated_by text,updated text);');
  for(const [id,name] of [['a','Test Rep'],['b',' REP, TEST '],['c','Another Rep']])await db.query('INSERT INTO production.jobs VALUES($1,$2,1,\'before\')',[id,JSON.stringify({salesRep:name,salesRepEmail:'typo@example.com',amount:150,history:[]})]);
  const wrap=tx=>({unsafe:async(q,args=[])=>q.includes('pg_advisory_xact_lock')?[]:(await tx.query(q,args)).rows});
  const sql={begin:fn=>db.transaction(tx=>fn(wrap(tx)))};
  const args={name:'Test Rep',email:'correct@example.com',repairId:'test-request'};
  assert.deepEqual(await correctSalesRepEmail(sql,args),{name:'Test Rep',email:'correct@example.com',matchedJobs:2,updatedJobs:2,verified:true});
  const rows=(await db.query('SELECT * FROM production.jobs ORDER BY id')).rows;
  for(const row of rows.slice(0,2)){const job=JSON.parse(row.payload);assert.equal(job.salesRepEmail,args.email);assert.equal(job.amount,150);assert.equal(row.version,2);assert.equal(job.history.length,1);}
  assert.equal(JSON.parse(rows[2].payload).salesRepEmail,'typo@example.com');assert.equal(rows[2].version,1);
  await db.query('UPDATE production.operations_config SET payload=$1 WHERE id=$2',[JSON.stringify({name:args.name,email:'later@example.com'}),'sales-rep:test rep']);
  assert.equal((await correctSalesRepEmail(sql,args)).alreadyApplied,true);
  assert.equal(JSON.parse((await db.query('SELECT payload FROM production.operations_config WHERE id=$1',['sales-rep:test rep'])).rows[0].payload).email,'later@example.com');
  await assert.rejects(()=>correctSalesRepEmail(sql,{...args,name:'Missing Rep',repairId:'missing'}),/No matching/);
 }finally{await db.close();}
});
