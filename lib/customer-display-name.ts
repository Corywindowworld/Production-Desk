// Format document names without modifying the customer account or signed text.
export function customerDisplayName(value:unknown, first?:unknown, last?:unknown):string{
 const name=String(value??'').trim().replace(/\s+/g,' '),given=String(first??'').trim(),family=String(last??'').trim();
 if(given&&family)return family+', '+given;
 if(!name||name.includes(','))return name;
 // Business and organization names must remain intact.
 if(/\b(LLC|INC\.?|CORP\.?|CORPORATION|LTD\.?|CHURCH|ASSOCIATION|CONDOMINIUM|COMPANY|SCHOOL|BEARINGS|RESTORATION|SQUARE)\b/i.test(name))return name;
 const parts=name.split(' ');if(parts.length<2)return name;
 const suffix=/^(Jr\.?|Sr\.?|II|III|IV)$/i.test(parts[parts.length-1])?parts.pop():'';
 const surname=parts.pop()!;
 return surname+(suffix?' '+suffix:'')+', '+parts.join(' ');
}
