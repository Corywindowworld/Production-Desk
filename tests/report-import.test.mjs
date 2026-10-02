import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'vite';
const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false}});const {parseGuildReport,parseBonusReport}=await vite.ssrLoadModule('/lib/report-import.ts');
test('GQ parser reconciles all four columns and refuses unreadable/missing rows',()=>{
 const sample='1605-Supervisor Test\nC123-Test Crew\n8/26/2026 1234 8/24/2026 Customer Name 4 3 2 0 9\nRegion Totals: Sum: 4 3 2 0 9';
 assert.deepEqual(parseGuildReport(sample)[0].ratings,[4,3,2,0]);
 assert.throws(()=>parseGuildReport(sample.replace('4 3 2 0 9\n','4 3 2 0 8\n')),/totals/i);
 assert.throws(()=>parseGuildReport(sample.replace('8/26/2026','8/2G/2026')),/reconcile/i);
 assert.throws(()=>parseGuildReport(sample.replace('Region Totals','Missing Totals')),/regional total/i);
});
test('bonus import keeps literal payouts instead of inferring from multipliers',()=>{
 const sample=`Targets For September 2026\nPotential Bonus Pool: $7,667.00\n$ At Risk
0.0% 0.0% $0 $0 1.20 TWITA $3,680
0.1% 3.0% $1 $45,735 1.00 Very good $3,067
3.1% 5.0% $45,736 $76,225 0.75 Above Average $2,300
5.1% 7.0% $76,226 $106,715 0.50 Average $1,533
7.1% 9.0% $106,716 $137,206 0.25 Below Average $767
9.1% $137,207 0.00 Poor $0
# Jobs At Risk
0.0% 0.0% 0 0 1.20 TWITA $1,840
0.1% 5.0% 1 6 1.00 Very good $1,533
5.1% 10.0% 7 12 0.75 Above Average $1,150
10.1% 15.0% 13 19 0.5 Average $767
15.1% 20.0% 20 25 0.25 Below Average $383
20.1% 26 0.00 Poor $0
GuildQuality Rating
3.80 4.00 1.20 TWITA $3,680
3.75 3.79 1.00 Very good $3,067
3.70 3.74 0.75 Above Average $2,300
3.60 3.69 0.5 Average $1,533
3.50 3.59 0.25 Below Average $0
0.00 3.49 0 Poor $0`;
 const c=parseBonusReport(sample);assert.equal(c.pool,7667);assert.equal(c.period,'2026-09-29');assert.equal(c.payouts.quality[4],0);assert.deepEqual(c.jobs,[6,12,19,25]);
 assert.throws(()=>parseBonusReport(sample.replace('3.50 3.59 0.25 Below Average $0','')),/six payout rows/i);
});
test.after(()=>vite.close());
