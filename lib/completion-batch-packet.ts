// Keep the approved visit frozen, but include a required lead form added afterwards.
export function completionPacketJob(live:any,labor:any){
 const packet=labor.packetJob||live;
 const saved=packet.operations?.leadRenovation;
 const lead=saved?.signatureDataUrl?saved:live.operations?.leadRenovation;
 return {...packet,leadRenovationJob:!!(packet.leadRenovationJob||live.leadRenovationJob||lead?.signatureDataUrl),operations:{...packet.operations,leadRenovation:lead}};
}
export function completionPacketMissing(job:any){
 const missing:string[]=[];
 if(!job.operations?.report?.approved||!job.operations.report.certificate)missing.push('Approved certificate');
 if(job.leadRenovationJob&&!job.operations?.leadRenovation?.signatureDataUrl)missing.push('Lead Renovation sheet');
 return missing;
}
