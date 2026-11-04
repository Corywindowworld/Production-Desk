// Keep document previews inside the current Production Desk window (including iPad/PWA).
export function openInAppDocument(options:{html?:string;url?:string;title?:string}):Window {
 const previous=document.activeElement as HTMLElement|null;
 const dialog=document.createElement('dialog');
 dialog.setAttribute('aria-label',options.title||'Print preview');
 dialog.style.cssText='position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:#eef3f8;color:#18314f;';
 const container=document.createElement('div');
 container.style.cssText='display:flex;flex-direction:column;height:100%;';
 const toolbar=document.createElement('nav');
 toolbar.setAttribute('aria-label','Document preview controls');
 toolbar.style.cssText='display:flex;align-items:center;gap:12px;padding:12px 16px;background:white;border-bottom:1px solid #b8c7d6;flex-shrink:0;';
 const title=document.createElement('strong');title.textContent=options.title||'Print preview';title.style.flex='1';
 const print=document.createElement('button');print.type='button';print.textContent='Print / Save PDF';
 const close=document.createElement('button');close.type='button';close.textContent='Close preview';
 for(const b of [print,close])b.style.cssText='border:1px solid #173a66;border-radius:8px;padding:10px 16px;background:white;color:#173a66;font:600 15px Arial;cursor:pointer;';
 const frame=document.createElement('iframe');frame.title=options.title||'Document preview';frame.style.cssText='width:100%;flex:1;min-height:0;border:0;background:white;';
 const cleanup=()=>{dialog.remove();previous?.focus();};
 close.onclick=()=>dialog.close();
 dialog.addEventListener('close',cleanup,{once:true});
 // Escape closes the preview, not the underlying job drawer.
 dialog.addEventListener('cancel',e=>{e.preventDefault();e.stopPropagation();dialog.close();});
 print.onclick=()=>{frame.contentWindow?.focus();frame.contentWindow?.print();};
 toolbar.append(title,print,close);container.append(toolbar,frame);dialog.append(container);document.body.append(dialog);dialog.showModal();
 if(options.html!==undefined){
  const w=frame.contentWindow!;w.document.open();
  w.document.write(options.html.replace('</head>','<style>@media screen{.toolbar,.print-exit,body>button{display:none!important}}</style></head>'));w.document.close();
  w.document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dialog.close();}});
 }else if(options.url){frame.src=options.url;}
 close.focus();
 return frame.contentWindow!;
}
export function openInAppPrint(html:string,title='Print preview'){return openInAppDocument({html,title});}
