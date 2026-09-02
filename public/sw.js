// Online-first: never store customer records, documents, or sign-in responses.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate' || url.origin !== self.location.origin || !['/','/installers','/installers/'].includes(url.pathname)) return;
  event.respondWith(fetch(event.request).catch(() => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Production Desk · Offline</title><style>body{font:16px Arial,sans-serif;background:#f3f7ff;color:#142b50;margin:0;padding:48px 24px}main{max-width:420px;margin:15vh auto}h1{font-size:28px}p{line-height:1.6}a{display:inline-block;background:#0055ed;color:white;padding:14px 22px;border-radius:8px;text-decoration:none}</style></head><body><main><h1>You’re offline</h1><p>Connect to the internet to view the latest jobs, save changes, and upload photos in Production Desk.</p><a href="/">Try again</a></main></body></html>`, {status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})));
});

self.addEventListener('push', event => {
 let data={};try{data=event.data?.json()||{}}catch{}
 event.waitUntil(self.registration.showNotification(data.title||'Production Desk',{body:data.body||'A new installer report is ready.',icon:'/app-icon-192.png',badge:'/app-icon-192.png',tag:data.tag||'installer-report',data:{url:data.url||'/'}}));
});
self.addEventListener('notificationclick', event => {
 event.notification.close();
 let target=new URL('/',self.location.origin);try{const candidate=new URL(event.notification.data?.url||'/',self.location.origin);if(candidate.origin===self.location.origin)target=candidate}catch{}
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{for(const client of clients){if(new URL(client.url).pathname==='/'){await client.navigate(target.href);return client.focus()}}return self.clients.openWindow(target.href)}));
});
