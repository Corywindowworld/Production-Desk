export function usesMobilePrint() {
 return /Android|iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function openMobilePrintPage(source: Window) {
 const page = window.open('', '_blank');
 if (!page) return false;
 page.opener = null;
 source.dispatchEvent(new Event('beforeprint'));
 const copy = source.document.documentElement.cloneNode(true) as HTMLElement;
 const base = document.createElement('base');
 base.href = source.document.baseURI;
 copy.querySelector('head')?.prepend(base);
 page.document.open();
 page.document.write('<!doctype html>' + copy.outerHTML);
 page.document.close();

 const controls = page.document.createElement('div');
 controls.style.cssText = 'padding:16px;background:#eef3f8;color:#18314f;font:16px system-ui;';
 const print = page.document.createElement('button');
 print.type = 'button';
 print.textContent = 'Print';
 print.style.cssText = 'padding:10px 18px;font:inherit;cursor:pointer;';
 print.onclick = () => page.print();
 const help = page.document.createElement('p');
 help.textContent = 'If Print does not open, use your browser’s Share menu and choose Print.';
 controls.append(print, help);
 page.document.body.prepend(controls);
 const style = page.document.createElement('style');
 style.textContent = '@media print{#production-desk-mobile-print{display:none!important}}';
 controls.id = 'production-desk-mobile-print';
 page.document.head.append(style);
 return true;
}

// Keep document previews inside the current Production Desk window (including iPad/PWA).
export function openInAppDocument(options:{html?:string;url?:string;title?:string;waitForImages?:boolean;onClose?:()=>void}):Window {
 const mobile=usesMobilePrint();
 const previous=document.activeElement as HTMLElement|null;
 const dialog=document.createElement('dialog');
 dialog.setAttribute('aria-label',options.title||'Print preview');
 dialog.style.cssText='position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:#eef3f8;color:#18314f;';
 const container=document.createElement('div');
 container.style.cssText='display:flex;flex-direction:column;height:100%;';
 const toolbar=document.createElement('nav');
 toolbar.setAttribute('aria-label','Document preview controls');
 toolbar.style.cssText='display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:12px 16px;background:white;border-bottom:1px solid #b8c7d6;flex-shrink:0;';
 const title=document.createElement('strong');title.textContent=options.title||'Print preview';title.style.flex='1';
 const print=document.createElement('button');print.type='button';print.textContent='Print / Save PDF';
 const close=document.createElement('button');close.type='button';close.textContent='Close preview';
 for(const b of [print,close])b.style.cssText='border:1px solid #173a66;border-radius:8px;padding:10px 16px;background:white;color:#173a66;font:600 15px Arial;cursor:pointer;';
 const frame=document.createElement('iframe');frame.title=options.title||'Document preview';frame.style.cssText='width:100%;flex:1;min-height:0;border:0;background:white;';
 const cleanup=()=>{dialog.remove();options.onClose?.();previous?.focus();};
 close.onclick=()=>dialog.close();
 dialog.addEventListener('close',cleanup,{once:true});
 // Escape closes the preview, not the underlying job drawer.
 dialog.addEventListener('cancel',e=>{e.preventDefault();e.stopPropagation();dialog.close();});
 const status=document.createElement('span');
 status.setAttribute('role','status');
 const openPdf=document.createElement('a');
 openPdf.textContent='Open PDF to print or save';
 openPdf.target='_blank';
 openPdf.rel='noopener';
 openPdf.style.cssText=print.style.cssText;
 if(options.url)openPdf.href=options.url;
 print.onclick=()=>{
  const preview=frame.contentWindow;
  if(!preview)return;
  if(mobile){
   if(!openMobilePrintPage(preview))status.textContent='Allow pop-ups to open the printable page.';
   return;
  }
  preview.focus();
  preview.print();
 };
 toolbar.append(title,mobile&&options.url?openPdf:print,close,status);container.append(toolbar,frame);dialog.append(container);document.body.append(dialog);dialog.showModal();
 if(options.html!==undefined){
  const w=frame.contentWindow!;w.document.open();
  w.document.write(options.html.replace('</head>','<style>@media screen{.toolbar,.print-exit,body>button{display:none!important}}</style></head>'));w.document.close();
  if(options.waitForImages && w.document.images.length){
   print.disabled=true;
   print.textContent='Preparing photos…';
   void Promise.all(Array.from(w.document.images,async photo=>{
    try{
     await photo.decode();
     return true;
    }catch{
     const message=w.document.createElement('p');
     message.textContent='Photo unavailable: '+photo.alt;
     photo.replaceWith(message);
     return false;
    }
   })).then(results=>{
    const missing=results.filter(loaded=>!loaded).length;
    if(missing)status.textContent=missing===1?'1 photo could not be loaded.':missing+' photos could not be loaded.';
    print.textContent='Print / Save PDF';
    print.disabled=false;
   });
  }
  w.document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dialog.close();}});
 }else if(options.url){frame.src=options.url;}
 close.focus();
 return frame.contentWindow!;
}
export function openInAppPrint(html:string,title='Print preview'){return openInAppDocument({html,title});}
