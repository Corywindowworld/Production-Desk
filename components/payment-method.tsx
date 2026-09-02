'use client';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {paymentMethods} from '@/lib/job-workflow';
export function PaymentMethod({value,onChange}:{value?:string|null;onChange?:(value:string)=>void}){
 return <label>Payment method<Select value={value||''} disabled={!onChange} onValueChange={onChange}><SelectTrigger aria-label="Payment method"><SelectValue placeholder="Select payment method"/></SelectTrigger><SelectContent>{paymentMethods.map(method=><SelectItem key={method} value={method}>{method}</SelectItem>)}</SelectContent></Select></label>;
}
