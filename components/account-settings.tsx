import {PhoneNotifications} from '@/components/phone-notifications';
import {ThemePicker} from '@/components/account-theme';
export function AccountSettings({name,email}:{name:string;email:string}){return <main className="accounts-page"><a href="/">← Dashboard</a><header className="accounts-header"><div><h1>Account management</h1><p>{name} · {email}</p></div></header><section className="profile-section"><h2>My account</h2><a href="/change-password">Change password</a></section><ThemePicker/><PhoneNotifications/></main>}
