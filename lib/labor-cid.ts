/** Only accept a labeled ID or the isolated ID field; never a phone/crew number. */
export function laborHeaderCid(text:string,isolated=false){
 const labeled=text.match(/(?:customer\s*id|cust\s*id|cid|\b[i1l]d)\s*[#＃:]?\s*:?\s*[|[({]*\s*((?:\d[ \t]*){6,8})(?![\d-])/i);
 if(labeled)return labeled[1].replace(/\s/g,'');
 if(isolated){const candidates=text.match(/\b\d{6,8}\b/g)||[];if(candidates.length===1)return candidates[0];}
 return '';
}
