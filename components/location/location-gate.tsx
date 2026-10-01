'use client';
import {useEffect,useRef,useState} from 'react';
export function LocationGate({children}:{children:React.ReactNode}){
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('Location sharing is required while signed in. Admin and your Field Supervisor can see your latest location. Customer sharing is limited to links you or the office create for a job.'),[native,setNative]=useState(false);
 const watch=useRef<number|null>(null),last=useRef(0),stopping=useRef(false),mounted=useRef(true);
 async function stop(){if(stopping.current)return;stopping.current=true;setReady(false);if(watch.current!==null)navigator.geolocation.clearWatch(watch.current);(window as any).ReactNativeWebView?.postMessage(JSON.stringify({type:'stop-location'}));try{const r=await fetch('/api/location',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'stop'})});if(!r.ok&&r.status!==401)throw Error();window.location.assign('/login')}catch{stopping.current=false;setMessage('Unable to reach the server to sign out. Access is blocked; reconnect and press Stop sharing & sign out again.');}}
 async function position(p:GeolocationPosition){if(stopping.current||!mounted.current||Date.now()-last.current<15000)return;last.current=Date.now();try{const r=await fetch('/api/location',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,observedAt:p.timestamp})});if(r.status===401){window.location.assign('/login');return}if(!r.ok)throw Error((await r.json()).error||'Location could not be saved.');setReady(true);setMessage('Location sharing is on. Stop sharing to sign out.')}catch(e){setMessage((e as Error).message);setReady(false)}finally{setBusy(false)}}
 async function start(){setBusy(true);setMessage('Requesting location permission…');try{
  if((window as any).ReactNativeWebView){const r=await fetch('/api/location/device',{method:'POST'}),d=await r.json();if(!r.ok)throw Error(d.error);(window as any).ReactNativeWebView.postMessage(JSON.stringify({type:'start-location',token:d.token,expires:d.expires}));return;}
  if(!navigator.geolocation)throw Error('This device does not support location sharing.');
  if(watch.current!==null)navigator.geolocation.clearWatch(watch.current);
  watch.current=navigator.geolocation.watchPosition(position,e=>{setBusy(false);if(e.code===1){void stop()}else {setMessage('Location is temporarily unavailable. Check signal and retry.');}}, {enableHighAccuracy:true,maximumAge:15000,timeout:25000});
 }catch(e){setBusy(false);setMessage((e as Error).message)}}
 useEffect(()=>{mounted.current=true;setNative(!!(window as any).ReactNativeWebView);let permission:PermissionStatus|undefined;
 const receive=(e:Event)=>{const d=(e as CustomEvent).detail;if(d?.status==='ready'){setBusy(false);setReady(true);setMessage('Background location sharing is on.')}else if(d?.status==='denied'){void stop()}else if(d?.message){setBusy(false);setMessage(d.message)}};
 window.addEventListener('production-location',receive);
 if(!(window as any).ReactNativeWebView)navigator.permissions?.query({name:'geolocation'}).then(p=>{permission=p;p.onchange=()=>{if(p.state==='denied')void stop()}}).catch(()=>{});
 const refresh=()=>{if(!native&&watch.current!==null&&document.visibilityState==='visible'){last.current=0;navigator.geolocation.getCurrentPosition(position,e=>{if(e.code===1)void stop()},{enableHighAccuracy:true,timeout:20000,maximumAge:0})}};
 document.addEventListener('visibilitychange',refresh);const timer=setInterval(refresh,30000);
 return ()=>{mounted.current=false;clearInterval(timer);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('production-location',receive);if(permission)permission.onchange=null;if(watch.current!==null)navigator.geolocation.clearWatch(watch.current)};
 // Tracking callbacks deliberately retain the current watch refs across renders.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 return <><section style={{padding:16,background:ready?'#eaf6ee':'#fff4dd',color:'#172c24'}} aria-live="polite"><strong>{ready?'LOCATION SHARING ON':'Location sharing required'}</strong><p>{message}</p>{!native&&<small>Web version: updates may pause when this page is closed or the phone is locked.</small>}<div>{!ready&&<button disabled={busy} onClick={start}>{busy?'Connecting…':'Enable location & continue'}</button>} <button onClick={stop}>Stop sharing & sign out</button></div></section>{ready&&children}</>;
}
