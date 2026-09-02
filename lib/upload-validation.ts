export const uploadKinds=['completion','incomplete','reorder','photos','front','rear','left','right','issue','visit'] as const;
export const MAX_UPLOAD_BYTES=15*1024*1024;
export function fileType(bytes:Uint8Array,kind:string){
 const ascii=(start:number,end:number)=>String.fromCharCode(...bytes.slice(start,end));
 return ascii(0,5)==='%PDF-'&&['completion','incomplete','reorder'].includes(kind)?'application/pdf':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes[0]===137&&ascii(1,4)==='PNG'?'image/png':ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'?'image/webp':ascii(0,3)==='GIF'?'image/gif':ascii(4,8)==='ftyp'&&['heic','heix','hevc','hevx','mif1','msf1','avif'].includes(ascii(8,12))?'image/heic':null;
}
