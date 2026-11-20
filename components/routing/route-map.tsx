'use client';
import {useEffect,useRef,useState} from 'react';
import 'leaflet/dist/leaflet.css';
export default function RouteMap({plan}:{plan:any}){
 const root=useRef<HTMLDivElement>(null),[error,setError]=useState('');
 useEffect(()=>{
  let alive=true,m:any,observer:ResizeObserver|undefined;
  void import('leaflet').then(L=>{
   if(!alive||!root.current)return;
   m=L.map(root.current,{scrollWheelZoom:false});
   L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19}).addTo(m);
   const ordered=plan.result.optimized.visits.map((v:any)=>plan.stops.find((s:any)=>s.id===v.id));
   const points=[{...plan.warehouse,location:plan.warehouse,label:'Warehouse · '+plan.warehouse.name},...ordered.map((s:any,i:number)=>({...s,label:`${i+1}. ${s.customer} · #${s.number}`}))];
   points.forEach((p:any,i:number)=>{
    const label=document.createElement('span');label.textContent=p.label;
    L.marker([p.location.latitude,p.location.longitude],{icon:L.divIcon({className:'',html:`<div style="background:${i?'#155cba':'#17623a'};color:white;border:2px solid white;border-radius:50%;width:30px;height:30px;text-align:center;line-height:26px;font-weight:bold;box-shadow:0 1px 4px #555">${i||'W'}</div>`,iconSize:[30,30],iconAnchor:[15,15]})}).bindPopup(label).addTo(m);
   });
   const bounds=L.latLngBounds(points.map((p:any)=>[p.location.latitude,p.location.longitude] as [number,number]));
   if(plan.geometry){const line=L.geoJSON(plan.geometry,{style:{color:'#155cba',weight:5,opacity:.85}}).addTo(m);bounds.extend(line.getBounds());}
   m.fitBounds(bounds,{padding:[35,35],maxZoom:15});
   observer=new ResizeObserver(()=>m?.invalidateSize());observer.observe(root.current);
  }).catch(()=>{if(alive)setError('Map could not load. The stop list is available below.');});
  return()=>{alive=false;observer?.disconnect();m?.remove()};
 },[plan.id]);
 return <div>{error&&<p role="status">{error}</p>}<div ref={root} style={{height:400,width:'100%',borderRadius:12,isolation:'isolate'}} role="region" aria-label="Optimized driving route with numbered stops"/><p><small>W = starting warehouse. Numbered markers follow the optimized stop order.{plan.warehouse.returnToWarehouse?' Route includes return to the warehouse.':''}</small></p></div>;
}
