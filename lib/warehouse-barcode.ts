// Rotate the pixels supplied to the decoder, not just the visible camera preview.
// Linear barcode readers need a scan line that crosses the bars.
export function decodeWarehouseFrame(
 reader:{decodeFromCanvas:(canvas:HTMLCanvasElement)=>{getText:()=>string}},
 source:CanvasImageSource,width:number,height:number,canvas:HTMLCanvasElement,
 maxDimension=1800,
):string|null{
 if(!width||!height)return null;
 const scale=Math.min(1,maxDimension/Math.max(width,height));
 const w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
 for(const angle of [0,90,180,270]){
  canvas.width=angle%180?h:w;canvas.height=angle%180?w:h;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context)throw Error('Camera image could not be read.');
  context.translate(canvas.width/2,canvas.height/2);
  context.rotate(angle*Math.PI/180);
  context.drawImage(source,-w/2,-h/2,w,h);
  try{const value=reader.decodeFromCanvas(canvas).getText();if(value.trim())return value;}catch{/* No barcode at this orientation; try the next one. */}
 }
 return null;
}
