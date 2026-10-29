 'use client';
import {useState} from 'react';
import {ThemePicker} from '@/components/account-theme';
import {PhoneNotifications} from '@/components/phone-notifications';
import {AccountProfile} from '@/components/account-profile';
export function AccountSettings({id,name,email}:{id:string;name:string;email:string}){const [tab,setTab]=useState('profile');return <main className="accounts-page"><a href="/">← Dashboard</a><header className="accounts-header"><div><h1>Account management</h1><p>{name} · {email}</p></div></header><nav className="account-tabs">{[['profile','My profile'],['appearance','Appearance'],['notifications','Notifications']].map(([value,label])=><button key={value} aria-pressed={tab===value} onClick={()=>setTab(value)}>{label}</button>)}</nav>{tab==='profile'&&<AccountProfile id={id}/>} {tab==='appearance'&&<ThemePicker/>}{tab==='notifications'&&<PhoneNotifications/>}</main>}
