'use client';
import {useCallback,useEffect,useRef} from 'react';
import 'leaflet/dist/leaflet.css';
export default function MapCanvas({points}:{points:any[]}){
 const element=useRef<HTMLDivElement>(null),map=useRef<any>(null),leaflet=useRef<any>(null);
 const latest=useRef(points),markers=useRef<Map<string,any>>(new Map()),fitted=useRef(false);
 latest.current=points;
 const draw=useCallback(()=>{
  const L=leaflet.current,m=map.current;if(!L||!m)return;
  const valid=latest.current.filter(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude));
  const seen=new Set<string>();
  valid.forEach((p,index)=>{
   const key=String(p.id||p.name||index);seen.add(key);
   const color=p.status==='Stale'||p.stale?'#a56d09':'#155cba';
   const label=document.createElement('div');
   label.textContent=`${p.name||'Installer'} · ${p.status||'Location'} · ${new Date(Number(p.observed_at||p.observedAt)).toLocaleString()}`;
   let marker=markers.current.get(key);
   if(marker){marker.setLatLng([p.latitude,p.longitude]);marker.setStyle({color});marker.setPopupContent(label);}
   else {marker=L.circleMarker([p.latitude,p.longitude],{radius:9,color,fillOpacity:.8}).bindPopup(label).addTo(m);markers.current.set(key,marker);}
  });
  markers.current.forEach((marker,key)=>{if(!seen.has(key)){marker.remove();markers.current.delete(key);}});
  // Fit once when the first locations arrive. Subsequent updates only move markers.
  if(valid.length&&!fitted.current){fitted.current=true;m.fitBounds(valid.map(p=>[p.latitude,p.longitude]),{padding:[35,35],maxZoom:15});}
 },[]);
 useEffect(()=>{
  let alive=true;
  void import('leaflet').then(L=>{
   if(!alive||!element.current)return;
   leaflet.current=L;map.current=L.map(element.current).setView([27.95,-82.46],10);
   L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19}).addTo(map.current);
   map.current.on('dragstart',()=>{fitted.current=true});
   draw();
  });
  return()=>{alive=false;map.current?.remove();map.current=null;leaflet.current=null;markers.current.clear();fitted.current=false};
 },[draw]);
 useEffect(()=>{draw()},[points,draw]);
 return <div ref={element} style={{height:440,width:'100%',borderRadius:12}} aria-label="Installer location map"/>;
}
