import {IdentityError} from '@/server/auth/employee';
type Env=Record<string,string|undefined>;
export function identityCookieName(env:Env){
 try{return 'sb-'+new URL(env.NEXT_PUBLIC_SUPABASE_URL??'').hostname.split('.')[0]+'-auth-token';}
 catch{throw new IdentityError('NOT_CONFIGURED');}
}
export function identityServiceUrl(env:Env){
 const raw=env.DEPLOYMENT_TARGET==='self-hosted'?(env.IDENTITY_SERVICE_URL||env.NEXT_PUBLIC_SUPABASE_URL):env.NEXT_PUBLIC_SUPABASE_URL;
 try{const url=new URL(raw??'');if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error();
  if(env.DEPLOYMENT_TARGET!=='self-hosted'&&(url.protocol!=='https:'||url.hostname!==env.IDENTITY_PROJECT_REF+'.supabase.co'))throw new Error();
  return url.origin;
 }catch{throw new IdentityError('NOT_CONFIGURED');}
}
export function localDatabaseUrl(raw:string,purpose:'identity'|'business',env:Env){
 try{const url=new URL(raw),prefix=purpose.toUpperCase(),host=env[prefix+'_DATABASE_HOST'];
  if(!host||url.hostname!==host||!['postgres:','postgresql:'].includes(url.protocol)||decodeURIComponent(url.username)!==purpose+'_backend'||!url.password||url.search||url.hash||url.pathname!=='/postgres')throw new Error();
  return raw;
 }catch{throw new IdentityError('NOT_CONFIGURED');}
}
export function databaseSsl<T>(purpose:'identity'|'business',env:Env,verified:()=>T):T|false{
 const mode=env[purpose.toUpperCase()+'_DATABASE_TLS'];
 if(env.DEPLOYMENT_TARGET==='self-hosted'&&mode==='disable'){
  // Plaintext is confined to explicitly named loopback/Compose/private hosts.
  const host=env[purpose.toUpperCase()+'_DATABASE_HOST']??'';
  if(!/^(localhost|127\.0\.0\.1|identity-db|business-db|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(host))throw new IdentityError('NOT_CONFIGURED');
  return false;
 }
 if(mode&&mode!=='verify')throw new IdentityError('NOT_CONFIGURED');
 return verified();
}
