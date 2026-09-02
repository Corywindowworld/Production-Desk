import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
const vite=await createServer({configFile:false,server:{middlewareMode:true}});
const {transitionError,jobSchema,incompleteAge,boardStage,nextIncompleteSince,jobAging,jobTotals}=await vite.ssrLoadModule('/lib/job-workflow.ts');
await vite.close();
const job=(stage,kinds=[])=>({stage,attachments:kinds.map(kind=>({kind}))});
test('new jobs start in Received and cannot skip Production',()=>{
 assert.equal(transitionError(null,job('Received')),'');
 assert.ok(transitionError(null,job('Production')));
 assert.ok(transitionError('Received',job('Closed',['completion'])));
 assert.equal(transitionError('Received',job('Production')),'');
});
test('closing requires a completion certificate',()=>{
 assert.ok(transitionError('Production',job('Closed')));
 assert.ok(transitionError('Production',job('Closed',['incomplete','reorder','photos'])));
 assert.equal(transitionError('Production',job('Closed',['completion'])),'');
});
test('incomplete requires all three attachment types',()=>{
 for(const missing of ['incomplete','reorder','photos'])assert.ok(transitionError('Production',job('Incomplete',['incomplete','reorder','photos'].filter(x=>x!==missing))));
 assert.equal(transitionError('Production',job('Incomplete',['incomplete','reorder','photos'])),'');
 assert.equal(transitionError('Incomplete',job('Production')),'');
});
test('incomplete reason cannot be blank',()=>{
 const result=jobSchema.safeParse({id:'5f36df46-7f37-4c72-a365-654af766b5ca',number:'100',customer:'Test',address:'',supervisor:'',crew:'',stage:'Incomplete',eta:'',install:'',blocker:'  ',notes:'',version:1,history:[],attachments:[]});
 assert.equal(result.success,false);
 assert.ok(result.error.issues.some(x=>x.path[0]==='blocker'));
});

const since='2026-01-01T10:00:00.000Z';
const start=Date.parse(since), day=86400000;
const incomplete={stage:'Incomplete',incompleteSince:since};
test('alerts strictly after 30 days and moves category at exactly 45 days',()=>{
 assert.equal(incompleteAge(incomplete,start+30*day).alert,false);
 assert.equal(incompleteAge(incomplete,start+30*day+1).alert,true);
 assert.equal(boardStage(incomplete,start+45*day-1),'Incomplete');
 assert.equal(boardStage(incomplete,start+45*day),'Aged Incomplete');
 assert.equal(incompleteAge(incomplete,start+45*day).days,45);
 assert.equal(boardStage({...incomplete,stage:'Production'},start+60*day),'Production');
});
test('edits preserve the clock; returning to production clears it; reentry restarts it',()=>{
 const later='2026-03-01T10:00:00.000Z';
 assert.equal(nextIncompleteSince(incomplete,'Incomplete',later),since);
 assert.equal(nextIncompleteSince(incomplete,'Production',later),null);
 assert.equal(nextIncompleteSince({stage:'Production'},'Incomplete',later),later);
});
test('older jobs recover latest incomplete transition, not creation or review dates',()=>{
 const legacy={stage:'Incomplete',history:[{at:'2026-02-02T10:00:00Z',text:'Updated notes'},{at:since,text:'Stage: Production → Incomplete · Updated blocker'},{at:'2025-01-01T10:00:00Z',text:'Stage: Production → Incomplete'}]};
 assert.equal(incompleteAge(legacy,start+45*day).since,since);
 assert.equal(boardStage(legacy,start+45*day),'Aged Incomplete');
 assert.equal(incompleteAge({stage:'Incomplete',history:[]},start).days,null);
});

test('received warnings, aging, and scheduling exemption',()=>{
 const j={stage:'Received',received:'2026-01-01',install:''};const t=Date.parse(j.received);
 assert.equal(jobAging(j,t+22*day).warning,false);
 assert.match(jobAging(j,t+23*day).message,/7-day warning/);
 assert.match(jobAging(j,t+27*day).message,/3-day warning/);
 assert.equal(boardStage(j,t+30*day),'Aged Received');
 assert.equal(boardStage({...j,install:'2026-03-01'},t+40*day),'Received');
 assert.equal(jobAging({stage:'Received'},t+40*day).aged,false);
});
test('incomplete warnings precede its 45-day threshold',()=>{
 assert.match(jobAging(incomplete,start+38*day).message,/7-day warning/);
 assert.match(jobAging(incomplete,start+42*day).message,/3-day warning/);
 assert.equal(boardStage(incomplete,start+45*day),'Aged Incomplete');
});
test('production uses actual installation and stops aging on resolution',()=>{
 const j={stage:'Production',install:'2025-01-01',installed:'2026-01-01'};const t=Date.parse(j.installed);
 assert.equal(boardStage(j,t+7*day),'Production');
 assert.equal(boardStage(j,t+7*day+1),'Aged Production');
 assert.equal(boardStage({...j,installed:''},t+20*day),'Production');
 assert.equal(boardStage({...j,stage:'Closed'},t+20*day),'Closed');
});
test('totals count missing values and sum exact cents',()=>{
 assert.deepEqual(jobTotals([{stage:'Received',amount:0.1},{stage:'Production',amount:0.2},{stage:'Incomplete'}]),{count:3,amount:0.3,missing:1});
});
