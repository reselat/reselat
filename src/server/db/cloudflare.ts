import postgres from 'postgres';
import {IdentityError} from '@/server/auth/employee';
import {verifyTargetMarker,type DatabasePurpose} from './config';
type Sql=ReturnType<typeof postgres>;
type CloudflareContext={env:Record<string,unknown>;ctx:object};
// Same global slot that @opennextjs/cloudflare's getCloudflareContext() reads; avoids a runtime dependency in Node (Vercel/local/test).
const contextSymbol=Symbol.for('__cloudflare-context__');
const perRequest=new WeakMap<object,Map<DatabasePurpose,Promise<Sql>>>();
export const hyperdriveBinding=(purpose:DatabasePurpose)=>purpose==='identity'?'HYPERDRIVE_IDENTITY':'HYPERDRIVE_BUSINESS';
export function cloudflareContext():CloudflareContext{
 const value=(globalThis as Record<symbol,unknown>)[contextSymbol] as CloudflareContext|undefined;
 if(!value?.env||!value.ctx)throw new IdentityError('NOT_CONFIGURED');
 return value;
}
export function hyperdriveTarget(purpose:DatabasePurpose,env:Record<string,unknown>,processEnv:Record<string,string|undefined>){
 const binding=env[hyperdriveBinding(purpose)] as {connectionString?:unknown}|undefined;
 const url=typeof binding?.connectionString==='string'?binding.connectionString:'';
 const projectRef=processEnv[purpose==='identity'?'IDENTITY_PROJECT_REF':'BUSINESS_PROJECT_REF'];
 // Cloudflare must go through Hyperdrive (verify-full with the Supabase CA); there is no direct-TCP fallback because Workers cannot pin a custom CA.
 if(!url||!projectRef||!/^[a-z0-9]{20}$/.test(projectRef)||processEnv.IDENTITY_PROJECT_REF===processEnv.BUSINESS_PROJECT_REF)throw new IdentityError('NOT_CONFIGURED');
 return {url,projectRef};
}
async function open(purpose:DatabasePurpose,env:Record<string,unknown>){
 const target=hyperdriveTarget(purpose,env,process.env);
 // Hyperdrive pools upstream; per-request clients are cheap. No prepare:false under Hyperdrive.
 const sql=postgres(target.url,{max:5,fetch_types:false,idle_timeout:10,connect_timeout:10,onnotice:()=>{}});
 try{
  const rows=purpose==='identity'?await sql`select purpose,project_ref from trade_private.deployment_identity`:await sql`select purpose,project_ref from trade_business.deployment_identity`;
  verifyTargetMarker(rows.map(row=>({purpose:row.purpose,project_ref:row.project_ref})),purpose,target.projectRef);
  return sql;
 }catch(error){await sql.end({timeout:3}).catch(()=>{});if(error instanceof IdentityError)throw error;throw new IdentityError('NOT_CONFIGURED');}
}
export function cloudflareDatabase(purpose:DatabasePurpose){
 const {env,ctx}=cloudflareContext();
 // Workers forbid reusing sockets across requests, so the cache is scoped to the request context.
 let map=perRequest.get(ctx);if(!map){map=new Map();perRequest.set(ctx,map);}
 let existing=map.get(purpose);
 if(!existing){existing=open(purpose,env).catch(error=>{map.delete(purpose);throw error;});map.set(purpose,existing);}
 return existing;
}
