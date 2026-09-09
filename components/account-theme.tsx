'use client';
import {createContext,useContext,useEffect,useState} from 'react';
type Theme='light'|'dark'|'gators';
const ThemeContext=createContext<{theme:Theme;loading:boolean;apply:(theme:Theme)=>void}>({theme:'light',loading:true,apply:()=>{}});
export function AccountTheme({children}:{children:React.ReactNode}){
 const [theme,setTheme]=useState<Theme>('light'),[loading,setLoading]=useState(true);
 function apply(value:Theme){setTheme(value);document.documentElement.dataset.theme=value;document.documentElement.style.colorScheme=value==='dark'?'dark':'light'}
 useEffect(()=>{let live=true;fetch('/api/preferences',{cache:'no-store'}).then(async r=>{if(!r.ok)return;const d=await r.json();if(live&&['light','dark','gators'].includes(d.theme))apply(d.theme)}).catch(()=>{}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[]);
 return <ThemeContext.Provider value={{theme,loading,apply}}>{theme==='gators'&&<div className="gators-theme-banner"><img src="/florida-gators-logo.png" alt="Gator theme logo" width="48" height="28"/><span>FLORIDA GATORS</span></div>}{children}</ThemeContext.Provider>
}
export function ThemePicker(){const {theme,loading,apply}=useContext(ThemeContext);const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function choose(value:Theme){setBusy(true);setError('');setMessage('');try{const r=await fetch('/api/preferences',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({theme:value})}),d=await r.json();if(!r.ok)throw Error(d.error);apply(d.theme);setMessage('Theme saved to your account.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <section className="theme-settings"><h2>Appearance</h2><p>Choose your account theme. Light is the default. Your choice follows your account across devices.</p><div className="theme-options">{([{id:'light',name:'Light',description:'Current appearance · Default'},{id:'dark',name:'Dark',description:'Black and white with blue accents'},{id:'gators',name:'Florida Gators',description:'Orange and blue with a gator logo'}] as const).map(option=><button key={option.id} className={'theme-option theme-preview-'+option.id} aria-pressed={theme===option.id} disabled={busy||loading} onClick={()=>choose(option.id)}><span className="theme-swatch">{option.id==='gators'&&<img src="/florida-gators-logo.png" width="56" height="32" alt=""/>}<i/><i/><i/></span><strong>{option.name}{theme===option.id?' ✓':''}</strong><small>{option.description}</small></button>)}</div>{error&&<p role="alert" className="error">{error}</p>}{message&&<p role="status">{message}</p>}</section>
}
