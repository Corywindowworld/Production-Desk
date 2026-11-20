// Fast perpendicular passes first. Enhanced mode samples tilted rows and smaller
// regions so an intact portion can still decode when another portion is creased.
export function decodeWarehouseFrame(
 reader:{decodeFromCanvas:(canvas:HTMLCanvasElement)=>{getText:()=>string}},
 source:CanvasImageSource,width:number,height:number,canvas:HTMLCanvasElement,
 maxDimension=1800,enhanced=false,phase?:number,
):string|null{
 if(!width||!height)return null;
 const scale=Math.min(1,maxDimension/Math.max(width,height)),w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
 const angles=enhanced?[0,90,-12,12,78,102,-24,24,66,114]:[0,90];
 for(const angle of phase===undefined?angles:[angles[Math.abs(phase)%angles.length]]){
  const radians=angle*Math.PI/180,cos=Math.abs(Math.cos(radians)),sin=Math.abs(Math.sin(radians));
  canvas.width=Math.ceil(w*cos+h*sin);canvas.height=Math.ceil(w*sin+h*cos);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Camera image could not be read.');
  ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(radians);ctx.drawImage(source,-w/2,-h/2,w,h);ctx.setTransform(1,0,0,1,0,0);
  try{const value=reader.decodeFromCanvas(canvas).getText();if(value.trim())return value;}catch{}
  if(!enhanced)continue;
  // A curved or wrinkled label may leave only one readable scan band. Each
  // overlapping band gets its own threshold calculation and centered scan row.
  const full=ctx.getImageData(0,0,canvas.width,canvas.height),cw=canvas.width,ch=canvas.height;
  for(const center of [.2,.4,.6,.8]){
   const band=Math.max(1,Math.round(ch*.28)),top=Math.max(0,Math.min(ch-band,Math.round(ch*center-band/2)));
   canvas.height=band;const bandCtx=canvas.getContext('2d',{willReadFrequently:true})!;
   bandCtx.putImageData(full,0,-top);
   // Stretch local luminance while preserving barcode edges; do not blur bars.
   const pixels=bandCtx.getImageData(0,0,cw,band),data=pixels.data;
   let low=255,high=0;for(let i=0;i<data.length;i+=4){const gray=Math.round(.299*data[i]+.587*data[i+1]+.114*data[i+2]);low=Math.min(low,gray);high=Math.max(high,gray);data[i]=data[i+1]=data[i+2]=gray;}
   if(high-low>30){for(let i=0;i<data.length;i+=4){const gray=Math.round((data[i]-low)*255/(high-low));data[i]=data[i+1]=data[i+2]=gray;}bandCtx.putImageData(pixels,0,0);}
   try{const value=reader.decodeFromCanvas(canvas).getText();if(value.trim())return value;}catch{}
  }
 }
 return null;
}
