import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';
import {authDatabase} from '@/server/db/client';
export class LoginLimitError extends Error{constructor(public status:number,public retryAfter=0){super(status===429?'LOGIN_LIMIT':'LOGIN_UNAVAILABLE');}}
export function loginBucket(request:Request,email:string,env:NodeJS.ProcessEnv=process.env){
 const secret=env.LOGIN_RATE_LIMIT_SECRET;if(!secret||secret.length<32)throw new LoginLimitError(503);
 let ip:string|null=null;
 if(env.DEPLOYMENT_TARGET==='cloudflare')ip=request.headers.get('cf-connecting-ip');
 else if(env.VERCEL==='1')ip=request.headers.get('x-forwarded-for');
 else if(env.DEPLOYMENT_TARGET==='self-hosted'&&env.LOGIN_TRUST_PROXY==='caddy')ip=request.headers.get('x-trade-client-ip');
 else if(env.NODE_ENV==='development')ip='127.0.0.1';
 if(!ip||!isIP(ip.trim()))throw new LoginLimitError(503);ip=ip.trim();if(isIP(ip)===6)ip=new URL('http://['+ip+']').hostname;
 return createHmac('sha256',secret).update(JSON.stringify([env.APP_ORIGIN,env.TRADE_COMPANY_ID,email.trim().toLowerCase(),ip])).digest('hex');
}
export async function limitedLogin<T extends {ok:boolean;status:number}>(request:Request,email:string,attempt:()=>Promise<T>):Promise<T>{const key=loginBucket(request,email);try{return await (await authDatabase()).begin(async tx=>{
 await tx`set local lock_timeout='12s'`;
 await tx`delete from trade_private.login_failure_counters where bucket_key in (select bucket_key from trade_private.login_failure_counters where window_start<clock_timestamp()-interval '1 day' limit 20)`;
 // Serializes just this opaque account/IP bucket, including the bounded upstream call.
 await tx`insert into trade_private.login_failure_counters(bucket_key) values(${key}) on conflict do nothing`;
 const rows=await tx`select failures,extract(epoch from (clock_timestamp()-window_start))::float8 as age from trade_private.login_failure_counters where bucket_key=${key} for update`;
 const age=Number(rows[0].age);let failures=Number(rows[0].failures);if(age>=900){failures=0;await tx`update trade_private.login_failure_counters set failures=0,window_start=clock_timestamp() where bucket_key=${key}`;}
 if(failures>=5)return {limited:true,retryAfter:Math.max(1,Math.ceil(900-age))} as const;
 const result=await attempt();if(result.ok)await tx`delete from trade_private.login_failure_counters where bucket_key=${key}`;else if(result.status===400||result.status===401)await tx`update trade_private.login_failure_counters set failures=failures+1 where bucket_key=${key}`;
 return result;
 }).then(value=>{if('limited' in value)throw new LoginLimitError(429,value.retryAfter);return value as T;});}catch(e){if(e instanceof LoginLimitError)throw e;throw new LoginLimitError(503);}}
