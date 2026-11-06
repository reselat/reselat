import {localDatabaseUrl} from '@/server/deployment/services';
import {IdentityError} from '@/server/auth/employee';
export function validateDatabaseUrl(raw:string){let url:URL;try{url=new URL(raw);}catch{throw new IdentityError('NOT_CONFIGURED');}const user=decodeURIComponent(url.username);if(!['postgres:','postgresql:'].includes(url.protocol)||!(user==='app_backend'||user.startsWith('app_backend.')))throw new IdentityError('NOT_CONFIGURED');return raw;}

export type DatabasePurpose='identity'|'business';
export type DatabaseTarget={purpose:DatabasePurpose;projectRef:string;url:string;caPath?:string};
export function validateDatabaseTarget(raw:string,purpose:DatabasePurpose,projectRef:string){
 try{
  if(!/^[a-z0-9]{20}$/.test(projectRef))throw new Error();
  const url=new URL(raw);const user=decodeURIComponent(url.username),role=purpose+'_backend';
  const direct=url.hostname===`db.${projectRef}.supabase.co`&&user===role;
  const pool=/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname)&&user===role+'.'+projectRef;
  const validPort=!url.port||url.port==='5432'||(pool&&url.port==='6543');
  if(!['postgres:','postgresql:'].includes(url.protocol)||(!direct&&!pool)||!url.password||url.search||url.hash||url.pathname!=='/postgres'||!validPort)throw new Error();
  return raw;
 }catch{throw new IdentityError('NOT_CONFIGURED');}
}
export function readDatabaseTarget(purpose:DatabasePurpose,env:Record<string,string|undefined>):DatabaseTarget{
 const prefix=purpose==='identity'?'IDENTITY':'BUSINESS';const projectRef=env[prefix+'_PROJECT_REF'],url=env[prefix+'_DATABASE_URL'];
 if(!projectRef||!url)throw new IdentityError('NOT_CONFIGURED');
 if(env.IDENTITY_PROJECT_REF&&env.BUSINESS_PROJECT_REF&&env.IDENTITY_PROJECT_REF===env.BUSINESS_PROJECT_REF)throw new IdentityError('NOT_CONFIGURED');
 if(purpose==='business'&&!env.IDENTITY_PROJECT_REF)throw new IdentityError('NOT_CONFIGURED');
 if(env.DEPLOYMENT_TARGET!=='self-hosted'&&env.NEXT_PUBLIC_SUPABASE_URL&&env.IDENTITY_PROJECT_REF){try{if(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname!==env.IDENTITY_PROJECT_REF+'.supabase.co')throw new Error();}catch{throw new IdentityError('NOT_CONFIGURED');}}
 return {purpose,projectRef,url:env.DEPLOYMENT_TARGET==='self-hosted'?localDatabaseUrl(url,purpose,env):validateDatabaseTarget(url,purpose,projectRef),caPath:env[prefix+'_DATABASE_CA_CERT']};
}
export function verifyTargetMarker(rows:readonly {purpose:unknown;project_ref:unknown}[],purpose:DatabasePurpose,projectRef:string){if(rows.length!==1||rows[0].purpose!==purpose||rows[0].project_ref!==projectRef)throw new IdentityError('NOT_CONFIGURED');}
