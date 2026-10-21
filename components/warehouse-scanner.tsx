'use client';
import {useEffect,useRef,useState} from 'react';
import {decodeWarehouseFrame} from '@/lib/warehouse-barcode';
export function WarehouseScanner({onScan}:{onScan:(value:string)=>void}){
 const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),generation=useRef(0);
 const [active,setActive]=useState(false),[error,setError]=useState(''),[torch,setTorch]=useState(false),[torchAvailable,setTorchAvailable]=useState(false);
 async function light(){const track=stream.current?.getVideoTracks()[0];if(!track)return;try{await track.applyConstraints({advanced:[{torch:!torch} as any]});setTorch(!torch);}catch{setError('This camera cannot change its light. Tilt the label away from reflections.')}}
 function release(){if(timer.current)clearTimeout(timer.current);timer.current=null;stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;if(video.current)video.current.srcObject=null;}
 function stop(){generation.current++;release();setActive(false)}
 useEffect(()=>()=>{generation.current++;release()},[]);
 async function start(){
  stop();setError('');setTorch(false);setTorchAvailable(false);setActive(true);const n=generation.current;
  try{
   const {BrowserMultiFormatReader}=await import('@zxing/browser');if(n!==generation.current)return;
   const camera=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});
   if(n!==generation.current){camera.getTracks().forEach(track=>track.stop());return;}
   stream.current=camera;const track=camera.getVideoTracks()[0],capabilities=track.getCapabilities?.() as any;setTorchAvailable(!!capabilities?.torch);if(capabilities?.focusMode?.includes('continuous'))try{await track.applyConstraints({advanced:[{focusMode:'continuous'} as any]})}catch{}const element=video.current;if(!element){stop();return;}element.srcObject=camera;await element.play();
   if(n!==generation.current)return;
   const {DecodeHintType}=await import('@zxing/library');const hints=new Map();hints.set(DecodeHintType.TRY_HARDER,true);const reader=new BrowserMultiFormatReader(),hardReader=new BrowserMultiFormatReader(hints),canvas=document.createElement('canvas');
   let frame=0;
   const scan=()=>{
    if(n!==generation.current)return;
    try{if(element.readyState>=2){const value=decodeWarehouseFrame(++frame%6===0?hardReader:reader,element,element.videoWidth,element.videoHeight,canvas,frame%6===0?1800:1000,frame%6===0,frame%6===0?Math.floor(frame/6):undefined);if(value){stop();onScan(value);return;}}}
    catch{stop();setError('Camera image could not be read. Try a barcode photo.');return;}
    timer.current=setTimeout(scan,100);
   };
   scan();
  }catch{if(n===generation.current){stop();setError('Camera unavailable. Use a barcode photo or type the barcode.')}}
 }
 async function photo(file?:File){
  if(!file)return;stop();setError('');const n=generation.current,url=URL.createObjectURL(file);
  try{const {BrowserMultiFormatReader}=await import('@zxing/browser');const image=new Image();image.src=url;await image.decode();if(n!==generation.current)return;
   const {DecodeHintType}=await import('@zxing/library');const hints=new Map();hints.set(DecodeHintType.TRY_HARDER,true);const value=decodeWarehouseFrame(new BrowserMultiFormatReader(hints),image,image.width,image.height,document.createElement('canvas'),2200,true);
   if(!value)throw Error('Not found');onScan(value);
  }catch{if(n===generation.current)setError('Barcode could not be read. Try a close, clear photo or enter the number beneath the barcode.')}
  finally{URL.revokeObjectURL(url)}
 }
 return <div className="wh-scanner"><div className="wh-actions"><button type="button" onClick={active?stop:start}>{active?'Stop camera':'Scan barcode'}</button><label className="wh-file-button">Read barcode photo<input type="file" accept="image/*" onChange={e=>{photo(e.target.files?.[0]);e.target.value=''}}/></label></div>{active&&<><p>Keep the entire barcode in view. Tilt slightly to avoid plastic glare; enhanced scanning checks tilted and partially creased labels. If bars are hidden by a fold, use the printed Customer ID and AQ/order search instead.</p>{torchAvailable&&<button type="button" onClick={light}>{torch?'Turn light off':'Turn light on'}</button>}</>}<video ref={video} muted playsInline style={{display:active?'block':'none',width:'100%',maxHeight:280}}/>{error&&<p role="alert">{error}</p>}</div>
}
