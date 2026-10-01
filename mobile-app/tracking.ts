import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';

export const ORIGIN = 'https://productiondesk.app';
const TASK = 'production-desk-location';
const KEY = 'production-desk-device';
type Device = {token: string; expires: number; stopping?: boolean};
type Notice = {status?: 'ready' | 'denied' | 'blocked'; message?: string};
let listener: (notice: Notice) => void = () => {};
export function subscribe(fn: typeof listener) { listener = fn; return () => { listener = () => {}; }; }
const read = async (): Promise<Device | null> => { const value = await SecureStore.getItemAsync(KEY); return value ? JSON.parse(value) : null; };
const store = (d: Device) => SecureStore.setItemAsync(KEY, JSON.stringify(d), {keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY});
async function halt() { if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK); }
async function request(d: Device, body: unknown) {
 const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000);
 try {return await fetch(ORIGIN + '/api/location', {method: 'POST', signal: controller.signal, headers: {'Content-Type':'application/json', Authorization: 'Bearer ' + d.token}, body: JSON.stringify(body)});}
 finally {clearTimeout(timeout);}
}
let stopping=false;
export async function stopTracking() {
 if(stopping)return;stopping=true;try {
 const d = await read(); await halt();
 if (!d) return;
 await store({...d, stopping:true});
 listener({status:'blocked', message:'Signing out…'});
 try {
  const r = await request(d, {action:'stop'});
  if (!r.ok && r.status !== 401) throw new Error('Sign-out could not reach the server.');
  await SecureStore.deleteItemAsync(KEY); listener({status:'denied'});
 } catch { listener({status:'blocked', message:'Location sharing stopped. Reconnect to finish signing out. Access is blocked until then.'}); }
}
finally {stopping=false;}
}
async function allowed() {
 const [fg,bg,services] = await Promise.all([Location.getForegroundPermissionsAsync(),Location.getBackgroundPermissionsAsync(),Location.hasServicesEnabledAsync()]);
 return fg.granted && bg.granted && services;
}
async function send(p: Location.LocationObject, d: Device) {
 if (d.stopping) return;
 if (Date.now() >= d.expires) {await stopTracking(); return;}
 const r = await request(d, {latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy ?? 1000,observedAt:p.timestamp});
 if (r.status === 401) {await halt();await SecureStore.deleteItemAsync(KEY);listener({status:'denied'});return;}
 if (!r.ok) throw new Error('Location could not be saved. Check your connection and retry.');
 listener({status:'ready'});
}
TaskManager.defineTask<{locations: Location.LocationObject[]}>(TASK, async ({data,error}) => {
 const d = await read(); if (!d) {await halt();return;}
 if (d.stopping || Date.now() >= d.expires || !await allowed()) {await stopTracking();return;}
 if (error) {listener({message:'Location temporarily unavailable. Your last update will be marked stale.'});return;}
 const p=data?.locations?.at(-1); if (p) {try {await send(p,d);} catch {/* Do not fabricate movement or treat lost connectivity as permission revocation. */}}
});
let starting=false;
export async function startTracking(token: string, expires: number) {
 if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !Number.isFinite(expires) || expires <= Date.now()) throw new Error('Sign in again.');
 if(starting)return;starting=true;try {
 const old=await read(); if (old?.stopping) {await stopTracking();throw new Error('Finish signing out before starting a new session.');}
 const d={token,expires};await store(d);
 const fg=await Location.requestForegroundPermissionsAsync();
 if (!fg.granted) {await stopTracking();return;}
 const bg=await Location.requestBackgroundPermissionsAsync();
 if (!bg.granted || !await Location.hasServicesEnabledAsync()) {await stopTracking();return;}
 try {
  await Location.startLocationUpdatesAsync(TASK, {
   accuracy:Location.Accuracy.High, distanceInterval:25, timeInterval:30000,
   deferredUpdatesInterval:30000, pausesUpdatesAutomatically:false,
   showsBackgroundLocationIndicator:true,
   foregroundService:{notificationTitle:'Production Desk location sharing',notificationBody:'Your office can see your location while signed in. Open Production Desk to stop sharing and sign out.',killServiceOnDestroy:true}
  });
  const p=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});await send(p,d);
 } catch(e) {listener({status:'blocked',message:(e as Error).message});throw e;}
}
finally {starting=false;}
}
let checking=false;
export async function checkTracking() {
 if(checking||starting)return;checking=true;
 try {
  const d=await read();if(!d)return;
  if(d.stopping||Date.now()>=d.expires||!await allowed()){await stopTracking();return;}
  const p=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});await send(p,d);
 } catch {listener({message:'Waiting for a fresh location. Check your signal.'});}
 finally {checking=false;}
}
