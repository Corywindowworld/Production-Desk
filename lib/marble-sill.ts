/** Split into stock-length pieces, preserving the exact span at 1/32-inch precision. */
export function sillPieceLengths(length:number):number[]{
 if(!Number.isFinite(length)||length<=0||length>3650)return [];
 const count=Math.ceil(length/73),ticks=Math.round(length*32),base=Math.floor(ticks/count),remainder=ticks%count;
 return Array.from({length:count},(_,i)=>(base+(i>=count-remainder?1:0))/32);
}
export function formatSillInches(value:number){
 if(!Number.isFinite(value))return '';
 const ticks=Math.round(value*32),whole=Math.floor(ticks/32);let num=ticks%32,den=32;
 if(!num)return String(whole);
 while(num%2===0){num/=2;den/=2;}
 return (whole?whole+' ':'')+num+'/'+den;
}
export function splitMarbleSills(items:any[]){
 return items.flatMap(item=>{
  if(item.type!=='Marble Sill'||!(item.sillLength>73))return [item];
  const pieces=sillPieceLengths(item.sillLength);
  return pieces.map((length,index)=>({...item,sillLength:length,sillOriginalLength:item.sillLength,sillSplitPart:index+1,sillSplitCount:pieces.length}));
 });
}
