'use client';
import {useEffect,useRef} from 'react';
import 'leaflet/dist/leaflet.css';
export default function MapCanvas({points}:{points:any[]}){
 const element=useRef<HTMLDivElement>(null),map=useRef<any>(null),layer=useRef<any>(null);
 useEffect(()=>{let alive=true;void import('leaflet').then(L=>{if(!alive||!element.current)return;map.current=L.map(element.current).setView([27.95,-82.46],10);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19}).addTo(map.current);layer.current=L.layerGroup().addTo(map.current);draw(L)});function draw(L:any){if(!map.current)return;layer.current.clearLayers();const valid=points.filter(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude));valid.forEach(p=>{const label=document.createElement('div');label.textContent=`${p.name||'Installer'} · ${p.status||'Location'} · ${new Date(Number(p.observed_at||p.observedAt)).toLocaleString()}`;L.circleMarker([p.latitude,p.longitude],{radius:9,color:p.status==='Stale'||p.stale?'#a56d09':'#155cba',fillOpacity:.8}).bindPopup(label).addTo(layer.current)});if(valid.length)map.current.fitBounds(valid.map(p=>[p.latitude,p.longitude]),{padding:[35,35],maxZoom:15})}return()=>{alive=false;map.current?.remove();map.current=null}},[points]);
 return <div ref={element} style={{height:440,width:'100%',borderRadius:12}} aria-label="Installer location map"/>;
}
