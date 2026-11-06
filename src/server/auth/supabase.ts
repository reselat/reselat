import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
import {identityServiceUrl,identityCookieName} from '@/server/deployment/services';
import {IdentityError} from './employee';
export async function authClient(timeoutMs?:number){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw new IdentityError('NOT_CONFIGURED');
 const jar=await cookies();
 return createServerClient(identityServiceUrl(process.env),key,{...(timeoutMs?{global:{fetch:(input:RequestInfo|URL,init?:RequestInit)=>fetch(input,{...init,signal:AbortSignal.any([AbortSignal.timeout(timeoutMs),...(init?.signal?[init.signal]:[])])})}}:{}),cookieOptions:{name:identityCookieName(process.env)},cookies:{
  getAll:()=>jar.getAll(),
  setAll:values=>{try{values.forEach(({name,value,options})=>jar.set(name,value,{...options,sameSite:'lax',secure:process.env.NODE_ENV==='production'}));}catch{/* Server components cannot set cookies; proxy refreshes them. */}}
 }});
}
