import {z} from 'zod';
export const warehouseManagers=['admin','warehouse'];
export const warehouseViewers=['admin','warehouse','supervisor','production_assistant','office','installer'];
export function splitWarehousePO(po:string){const match=po.trim().match(/^(\d+)-(\d+)(?:-[A-Z0-9]+)*$/i);if(!match)throw Error('Use store number followed by customer ID, such as 073-686442.');return {store:match[1],cid:match[2]};}
export const warehouseItemSchema=z.object({externalId:z.string().trim().min(1).max(120),po:z.string().regex(/^\d+-\d+(?:-[A-Z0-9]+)*$/i),order:z.string().trim().min(1).max(100),aq:z.string().trim().min(1).max(100),description:z.string().trim().max(2000).default('')});
export function parseWarehouseManifest(text:string){
 const pattern=/%[A-Z0-9]+\s+(\d+)\s+(\d+-\d+(?:-[A-Z0-9]+)*)\s+(\d+-\d+-\d+)/gi;
 const matches=[...text.matchAll(pattern)],seen=new Set<string>();
 const tokens=text.match(/%[A-Z0-9]+/gi)||[];if(tokens.length!==matches.length)throw Error('Some manifest items could not be matched to their PO/order. No items were imported. Review the source or enter those items manually.');
 return matches.map((m,i)=>{const externalId=m[0].split(/\s/)[0].toUpperCase();if(seen.has(externalId))throw Error('The manifest repeats an item ID. Review it before importing.');seen.add(externalId);return warehouseItemSchema.parse({externalId,order:m[1],po:m[2],aq:m[3],description:text.slice(m.index!+m[0].length,matches[i+1]?.index??text.length).replace(/\s+/g,' ').slice(0,2000)});});
}
export function warehouseTransition(status:string,action:string){
 const allowed:Record<string,string[]>={receive:['Expected','Missing','Damaged'],damage:['Expected','Received','Missing'],missing:['Expected'],return:['Received'],confirmReturn:['Return Pending']};
 if(!allowed[action]?.includes(status))throw Error('This item has already changed. Refresh before trying again.');
 return ({receive:'Received',damage:'Damaged',missing:'Missing',return:'Return Pending',confirmReturn:'Returned'} as Record<string,string>)[action];
}

// Full ASCII Code 39 readers decode the printed %Y prefix to DEL (127).
export function normalizeWarehouseBarcode(value:string){return value.trim().replace(/^\x7f/,'%Y').toUpperCase();}

export function manualWarehouseReference(current:string,day:string,id:string){return current.trim()||'MANUAL-'+day+'-'+id.slice(0,8);}
export const warehouseImportSchema=z.object({reference:z.string().trim().min(1,'Enter a shipment reference.').max(150,'Shipment reference must be 150 characters or fewer.'),name:z.string().trim().min(1,'Enter a shipment name.').max(180),store:z.string().trim().regex(/^\d+$/,'Enter a numeric store number, such as 073.').max(10),sourceText:z.string().max(500000).default(''),items:z.array(warehouseItemSchema).min(1,'Add at least one item before importing.').max(5000)});
