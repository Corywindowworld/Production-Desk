 'use client';
import {useState} from 'react';
import {ThemePicker} from '@/components/account-theme';
import {PhoneNotifications} from '@/components/phone-notifications';
import {InstallerDirectory} from './installer-directory';
import {AccountProfile} from '@/components/account-profile';
export function AccountSettings({id,name,email,installer=false,onSaved}:{id:string;name:string;email:string;installer?:boolean;onSaved?:()=>void}){const [tab,setTab]=useState('profile');return <main className="accounts-page"><a className="dashboard-button" href="/">Dashboard</a><header className="accounts-header"><div><h1>Account management</h1><p>{name} · {email}</p></div></header><nav className="account-tabs">{[['profile','My profile'],['appearance','Appearance'],['notifications','Notifications']].map(([value,label])=><button key={value} aria-pressed={tab===value} onClick={()=>setTab(value)}>{label}</button>)}</nav>{tab==='profile'&&(installer?<InstallerDirectory self onSaved={onSaved}/>:<AccountProfile id={id}/>)} {tab==='appearance'&&<ThemePicker/>}{tab==='notifications'&&<PhoneNotifications/>}</main>}
