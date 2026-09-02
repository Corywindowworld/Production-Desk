'use client';
import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
type InstallPrompt = Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};
export function InstallApp({name='Production Desk'}:{name?:string}){
 const [prompt,setPrompt]=useState<InstallPrompt|null>(null),[installed,setInstalled]=useState(false),[open,setOpen]=useState(false),[offline,setOffline]=useState(false),[busy,setBusy]=useState(false);
 useEffect(()=>{
  const mode=window.matchMedia('(display-mode: standalone)');
  const detect=()=>setInstalled(mode.matches||!!(navigator as Navigator & {standalone?:boolean}).standalone);
  const connection=()=>setOffline(!navigator.onLine);
  const ready=(event:Event)=>{event.preventDefault();setPrompt(event as InstallPrompt)};
  const complete=()=>{setInstalled(true);setPrompt(null);setOpen(false)};
  detect();connection();mode.addEventListener('change',detect);
  window.addEventListener('beforeinstallprompt',ready);window.addEventListener('appinstalled',complete);window.addEventListener('online',connection);window.addEventListener('offline',connection);
  if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(()=>{/* Installation remains available without offline fallback. */});
  return()=>{mode.removeEventListener('change',detect);window.removeEventListener('beforeinstallprompt',ready);window.removeEventListener('appinstalled',complete);window.removeEventListener('online',connection);window.removeEventListener('offline',connection)};
 },[]);
 async function install(){if(!prompt){setOpen(true);return;}setBusy(true);try{await prompt.prompt();await prompt.userChoice;setPrompt(null)}catch{setOpen(true)}finally{setBusy(false)}}
 return <>{offline&&<div className="offline-banner" role="status">You’re offline. Reconnect before saving changes or uploading photos.</div>}{!installed&&<div className="install-app"><Button variant="outline" disabled={busy} onClick={install}><Download size={16}/>{busy?'Opening…':'Install app'}</Button></div>}<Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Install {name}</DialogTitle><DialogDescription>Open jobs and schedules from your home screen in their own app window.</DialogDescription></DialogHeader><div className="install-instructions"><h3>iPhone or iPad</h3><p>Open this site in Safari. Tap Share (or More → Share), choose Add to Home Screen, keep Open as Web App enabled if shown, then tap Add.</p><h3>Android</h3><p>Open this site in Chrome. From the browser menu, choose Install app or Add to Home screen, then confirm.</p><h3>Computer</h3><p>In Chrome or Edge, use the install icon in the address bar or the browser’s app menu. In Safari on Mac, choose File → Add to Dock.</p><p>Internet access is required for job records, updates, and photos. Sign in with your authorized account when prompted.</p></div></DialogContent></Dialog></>;
}
