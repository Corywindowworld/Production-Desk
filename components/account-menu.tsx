 'use client';
import {useState} from 'react';
import {SignOutButton} from '@/components/auth-forms';
export function AccountMenu(){const [open,setOpen]=useState(false);return <div className="account-menu" onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false)}} onKeyDown={e=>{if(e.key==='Escape')setOpen(false)}}><a href="/accounts">Account management</a><button aria-label="Account options" aria-expanded={open} onClick={()=>setOpen(!open)}>▾</button>{open&&<div className="account-menu-popover"><SignOutButton/></div>}</div>}
