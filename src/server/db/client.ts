import {localTestEnabled} from '@/server/local-test/guard';
import postgres from 'postgres';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {databaseTls} from '../../../scripts/database-tls';
import {IdentityError} from '@/server/auth/employee';
import {databaseSsl} from '@/server/deployment/services';
import {cloudflareDatabase} from './cloudflare';
import {readDatabaseTarget,verifyTargetMarker,type DatabasePurpose} from './config';
const instances=new Map<DatabasePurpose,Promise<ReturnType<typeof postgres>>>();
async function connect(purpose:DatabasePurpose){
 const target=readDatabaseTarget(purpose,process.env);
 const sql=postgres(target.url,{max:5,prepare:false,idle_timeout:20,connect_timeout:10,ssl:databaseSsl(purpose,process.env,()=>databaseTls(readFileSync(target.caPath||resolve(process.cwd(),'assets/certificates/supabase-prod-ca-2021.crt'),'utf8'))),onnotice:()=>{}});
 try{
  const rows=purpose==='identity'?await sql`select purpose,project_ref from trade_private.deployment_identity`:await sql`select purpose,project_ref from trade_business.deployment_identity`;
  verifyTargetMarker(rows.map(row=>({purpose:row.purpose,project_ref:row.project_ref})),purpose,target.projectRef);
  return sql;
 }catch(error){await sql.end({timeout:3}).catch(()=>{});if(error instanceof IdentityError)throw error;throw new IdentityError('NOT_CONFIGURED');}
}
function connection(purpose:DatabasePurpose){if(process.env.DEPLOYMENT_TARGET==='cloudflare')return cloudflareDatabase(purpose);if(localTestEnabled())return import('@/server/local-test/database').then(m=>m.localDatabase(purpose));let existing=instances.get(purpose);if(!existing){existing=connect(purpose).catch(error=>{instances.delete(purpose);throw error;});instances.set(purpose,existing);}return existing;}
export const authDatabase=()=>connection('identity');
export const businessDatabase=()=>connection('business');
