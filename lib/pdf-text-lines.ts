// PDF writers sometimes emit one text item per glyph. Joining every item with a
// space turns CID 684452 into "6 8 4 4 5 2" and breaks labor row recognition.
export function joinPdfTextItems(items:{x:number;text:string;width?:number;height?:number}[]){
 const sorted=[...items].sort((a,b)=>a.x-b.x);let out='',previous:typeof sorted[number]|undefined;
 for(const item of sorted){const gap=previous?item.x-(previous.x+(previous.width??0)):0;const separated=previous&&(previous.width===undefined||gap>Math.max(1,Math.min(previous.height||10,item.height||10)*.15));out+=(separated&&!/\s$/.test(out)&&!/^\s/.test(item.text)?' ':'')+item.text;previous=item;}
 return out.trim();
}
