import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {createServer} from 'vite';
import zxing from '@zxing/library';
const {RGBLuminanceSource,BinaryBitmap,HybridBinarizer,MultiFormatReader}=zxing;
const vite=await createServer({configFile:false,server:{hmr:false}});
const {decodeWarehouseFrame}=await vite.ssrLoadModule('/lib/warehouse-barcode.ts');
// Generated Code 39 fixture; contains WAREHOUSE123 and no customer information.
const image=await loadImage(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAlsAAACWCAAAAADMRxLuAAABzUlEQVR4nO3SQQ6DIBRAwW/vf2e7NcGIafp2MysUBYnvOOfJMXNeBsfMLIPr5dxNrY9db75ZfN1i+w1vNr19/fZy3XTdZbvIv46wPeB2kXl3ljd/58HncRZ+py0q2qKiLSraoqItKtqioi0q2qKiLSraoqItKtqioi0q2qKiLSraoqItKtqioi0q2qKiLSraoqItKtqioi0q2qKiLSraoqItKtqioi0q2qKiLSraoqItKtqioi0q2qKiLSraoqItKtqioi0q2qKiLSraoqItKtqioi0q2qKiLSraoqItKtqioi0q2qKiLSraoqItKtqioi0q2qKiLSraoqItKtqioi0q2qKiLSraoqItKtqioi0q2qKiLSraoqItKtqioi0q2qKiLSraoqItKtqioi0q2qKiLSraoqItKtqioi0q2qKiLSraoqItKtqioi0q2qKiLSraoqItKtqioi0q2qKiLSraoqItKtqioi0q2qKiLSraoqItKtqioi0q2qKiLSraoqItKtqioi0q2qKiLSraoqItKtqioi0q2qKiLSraoqItKtqioi0q2qKiLSraoqItKtqioi0q2qKiLSraoqItKtqioi0q2qKiLSraovIFD/5IK5bi+1AAAAAASUVORK5CYII=','base64'));
const reader={decodeFromCanvas(canvas){const {data}=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height),gray=new Uint8ClampedArray(canvas.width*canvas.height);for(let i=0;i<gray.length;i++)gray[i]=data[i*4];return new MultiFormatReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(gray,canvas.width,canvas.height))));}};
for(const angle of [0,90,180,270])test(`live-frame decoding reads Code 39 at ${angle} degrees`,()=>{
 const frame=createCanvas(angle%180?image.height:image.width,angle%180?image.width:image.height),ctx=frame.getContext('2d');ctx.translate(frame.width/2,frame.height/2);ctx.rotate(angle*Math.PI/180);ctx.drawImage(image,-image.width/2,-image.height/2);
 assert.equal(decodeWarehouseFrame(reader,frame,frame.width,frame.height,createCanvas(1,1)),'WAREHOUSE123');
});
test('blank and not-yet-ready camera frames do not produce a scan',()=>{const blank=createCanvas(640,360);blank.getContext('2d').fillStyle='white';blank.getContext('2d').fillRect(0,0,640,360);assert.equal(decodeWarehouseFrame(reader,blank,640,360,createCanvas(1,1)),null);assert.equal(decodeWarehouseFrame(reader,blank,0,0,createCanvas(1,1)),null)});
test.after(()=>vite.close());
for(const angle of [-12,12,24])test(`enhanced decoding handles a label tilted ${angle} degrees`,()=>{
 const frame=createCanvas(900,500),ctx=frame.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,900,500);ctx.translate(450,250);ctx.rotate(angle*Math.PI/180);ctx.drawImage(image,-image.width/2,-image.height/2);
 assert.equal(decodeWarehouseFrame(reader,frame,900,500,createCanvas(1,1),1800,true),'WAREHOUSE123');
});
test('enhanced scanning recovers an intact band around a simulated crease',()=>{
 const frame=createCanvas(image.width,image.height),ctx=frame.getContext('2d');ctx.drawImage(image,0,0);ctx.fillStyle='white';ctx.fillRect(0,image.height*.35,image.width,image.height*.3);
 assert.equal(decodeWarehouseFrame(reader,frame,frame.width,frame.height,createCanvas(1,1),1800,true),'WAREHOUSE123');
});
