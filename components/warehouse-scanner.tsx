'use client';
import {useEffect,useRef,useState} from 'react';
import {decodeWarehouseFrame} from '@/lib/warehouse-barcode';
export function WarehouseScanner({onScan}:{onScan:(value:string)=>void}){
 const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),generation=useRef(0);
 const [active,setActive]=useState(false),[error,setError]=useState('');
 function release(){if(timer.current)clearTimeout(timer.current);timer.current=null;stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;if(video.current)video.current.srcObject=null;}
 function stop(){generation.current++;release();setActive(false)}
 useEffect(()=>()=>{generation.current++;release()},[]);
 async function start(){
  stop();setError('');setActive(true);const n=generation.current;
  try{
   const {BrowserMultiFormatReader}=await import('@zxing/browser');if(n!==generation.current)return;
   const camera=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});
   if(n!==generation.current){camera.getTracks().forEach(track=>track.stop());return;}
   stream.current=camera;const element=video.current;if(!element){stop();return;}element.srcObject=camera;await element.play();
   if(n!==generation.current)return;
   const reader=new BrowserMultiFormatReader(),canvas=document.createElement('canvas');
   const scan=()=>{
    if(n!==generation.current)return;
    try{if(element.readyState>=2){const value=decodeWarehouseFrame(reader,element,element.videoWidth,element.videoHeight,canvas);if(value){stop();onScan(value);return;}}}
    catch{stop();setError('Camera image could not be read. Try a barcode photo.');return;}
    timer.current=setTimeout(scan,250);
   };
   scan();
  }catch{if(n===generation.current){stop();setError('Camera unavailable. Use a barcode photo or type the barcode.')}}
 }
 async function photo(file?:File){
  if(!file)return;stop();setError('');const n=generation.current,url=URL.createObjectURL(file);
  try{const {BrowserMultiFormatReader}=await import('@zxing/browser');const image=new Image();image.src=url;await image.decode();if(n!==generation.current)return;
   const value=decodeWarehouseFrame(new BrowserMultiFormatReader(),image,image.width,image.height,document.createElement('canvas'),2200);
   if(!value)throw Error('Not found');onScan(value);
  }catch{if(n===generation.current)setError('Barcode could not be read. Try a close, clear photo or enter the number beneath the barcode.')}
  finally{URL.revokeObjectURL(url)}
 }
 return <div className="wh-scanner"><div className="wh-actions"><button type="button" onClick={active?stop:start}>{active?'Stop camera':'Scan barcode'}</button><label className="wh-file-button">Read barcode photo<input type="file" accept="image/*" onChange={e=>{photo(e.target.files?.[0]);e.target.value=''}}/></label></div>{active&&<p>Hold the label steady in either direction. Horizontal and vertical barcodes are supported. Scanning finds the item; you confirm the update.</p>}<video ref={video} muted playsInline style={{display:active?'block':'none',width:'100%',maxHeight:280}}/>{error&&<p role="alert">{error}</p>}</div>
}
