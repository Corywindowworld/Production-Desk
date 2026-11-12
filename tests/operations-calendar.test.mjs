import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
test('office calendars have complete Sunday through Saturday rows',async()=>{
 const server=await createServer({configFile:false,server:{middlewareMode:true}});
 try{
  const {datesFor,moveCalendar}=await server.ssrLoadModule('/app/operations-preview/schedule-view.tsx');
  assert.deepEqual(datesFor('2026-09-16','Week'),['2026-09-13','2026-09-14','2026-09-15','2026-09-16','2026-09-17','2026-09-18','2026-09-19']);
  for(const date of ['2026-09-16','2026-02-01','2028-02-15','2026-08-10']){
   const result=datesFor(date,'Month');
   assert.equal(new Date(result[0]+'T12:00:00Z').getUTCDay(),0);
   assert.equal(new Date(result.at(-1)+'T12:00:00Z').getUTCDay(),6);
   assert.equal(result.length%7,0);
   assert.ok(result.includes(date.slice(0,7)+'-01'));
  }
  assert.equal(moveCalendar('2026-09-16','Day',1),'2026-09-17');
  assert.equal(moveCalendar('2026-09-16','Week',-1),'2026-09-09');
  assert.equal(moveCalendar('2026-09-16','Month',1),'2026-10-01');
  assert.equal(moveCalendar('2026-01-31','Month',-1),'2025-12-01');
 }finally{await server.close()}
});
