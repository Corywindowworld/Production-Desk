import {z} from 'zod';
export const receiveJobSchema=z.object({
 jobId:z.string().uuid(),bay:z.string().trim().max(100),confirmed:z.literal(true),
 versions:z.array(z.object({id:z.string().uuid(),version:z.number().int().positive()})).min(1).max(2000),
 receivedIds:z.array(z.string().uuid()).max(2000),missingIds:z.array(z.string().uuid()).max(2000),pendingIds:z.array(z.string().uuid()).max(2000),reason:z.string().trim().max(2000).default(''),
});
export function checkReceiveJob(items:any[],input:z.infer<typeof receiveJobSchema>){
 const fail=(ok:any,message:string)=>{if(!ok)throw Error(message)};
 fail(input.versions.length===items.length&&new Set(input.versions.map(v=>v.id)).size===items.length,'Inventory changed. Refresh and review this job again.');
 const versions=new Map(input.versions.map(v=>[v.id,v.version]));fail(items.every(i=>versions.get(i.id)===i.version),'Inventory changed. Refresh and review this job again.');
 const ids=[...input.receivedIds,...input.missingIds,...input.pendingIds];fail(ids.length===new Set(ids).size,'Each window can have only one receiving decision.');
 const byId=new Map(items.map(i=>[i.id,i]));fail(ids.every(id=>byId.has(id)),'Every window must belong to the selected job.');
 fail(input.receivedIds.length+input.missingIds.length>0,'Scan windows or flag missing items before confirming.');
 fail(!input.receivedIds.length||!!input.bay,'Enter a bay for received windows.');
 fail(!input.missingIds.length||!!input.reason,'Enter a reason for the missing windows.');
 fail(input.receivedIds.every(id=>['Expected','Missing'].includes(byId.get(id).status)),'Only expected or previously missing windows can be received in this scan group. Review damaged or returned items individually.');
 fail(input.missingIds.every(id=>byId.get(id).status==='Expected'),'Only expected windows can be newly flagged missing.');
 fail(input.pendingIds.every(id=>byId.get(id).status==='Expected'),'Only expected windows can be left for a later delivery.');
 fail(items.filter(i=>i.status==='Expected').every(i=>ids.includes(i.id)),'Review every unscanned expected window: mark missing or leave expected for a later delivery.');
}
