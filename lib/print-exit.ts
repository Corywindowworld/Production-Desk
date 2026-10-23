// Standalone print views need navigation controls on iPad/PWA as well as desktop.
export function withPrintExit(html:string){
 const home=typeof window!=='undefined'&&/^https?:$/.test(window.location?.protocol)?window.location.origin+'/':'/';
 const safeHome=home.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 return html.replace('</head>','<style>.print-exit{position:sticky;top:0;z-index:10000;display:flex;justify-content:flex-end;gap:10px;padding:10px 16px;background:#eef3f8;border-bottom:1px solid #cbd5e1;font:15px Arial}.print-exit button,.print-exit a{display:inline-block;padding:10px 16px;margin:0;border:1px solid #173a66;border-radius:8px;background:white;color:#173a66;text-decoration:none;font-weight:bold}@media print{.print-exit{display:none!important}}</style></head>').replace('<body>','<body><nav class="print-exit" aria-label="Print navigation"><button type="button" onclick="window.close();setTimeout(function(){document.getElementById(\'return-app\').click()},150)">Close print view</button><a id="return-app" href="'+safeHome+'">Return to app</a></nav>');
}
