'use client';
import type {AnchorHTMLAttributes} from 'react';
import {openInAppDocument} from '@/lib/in-app-print';
export function InAppDocumentLink({href,children,onClick,...props}:AnchorHTMLAttributes<HTMLAnchorElement>){
 return <a {...props} href={href} onClick={e=>{onClick?.(e);if(e.defaultPrevented||!href)return;e.preventDefault();openInAppDocument({url:href,title:'Production Desk Document'});}}>{children}</a>;
}
