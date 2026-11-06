export type SetupPurpose='identity'|'business';
export function parseSeparatedOwner(raw:string,projectRef:string){
 try{
  if(!/^[a-z0-9]{20}$/.test(projectRef))throw new Error();
  const url=new URL(raw.trim());const user=decodeURIComponent(url.username);
  const direct=url.hostname===`db.${projectRef}.supabase.co`&&user==='postgres';
  const pool=/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname)&&user==='postgres.'+projectRef;
  if(!['postgres:','postgresql:'].includes(url.protocol)||(!direct&&!pool)||!url.password||url.search||url.hash||url.pathname!=='/postgres'||(url.port&&url.port!=='5432'))throw new Error();return url;
 }catch{throw new Error('WRONG_TARGET');}
}
export function parseLocalEnv(text:string):Record<string,string>{const result:Record<string,string>={};for(const line of text.split('\n')){const match=/^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());if(!match)continue;const raw=match[2];try{const value=raw.startsWith('"')?JSON.parse(raw):raw.startsWith("'")&&raw.endsWith("'")?raw.slice(1,-1):raw;if(typeof value!=='string')throw new Error();result[match[1]]=value;}catch{throw new Error('LOCAL_CONFIG_INVALID');}}return result;}
export function replaceSeparatedEnv(text:string,purpose:SetupPurpose,target:{projectRef:string;url:string;caPath:string}){
 const prefix=purpose==='identity'?'IDENTITY':'BUSINESS';let output=text;
 for(const [key,value] of Object.entries({[prefix+'_PROJECT_REF']:target.projectRef,[prefix+'_DATABASE_URL']:target.url,[prefix+'_DATABASE_CA_CERT']:target.caPath})){const pattern=new RegExp('^'+key+'=.*$','m'),line=key+'='+JSON.stringify(value);output=pattern.test(output)?output.replace(pattern,()=>line):output.trimEnd()+'\n'+line+'\n';}return output;
}
export function validateSavedTarget(raw:string,purpose:SetupPurpose,projectRef:string){try{const url=new URL(raw),role=purpose+'_backend';if(decodeURIComponent(url.username)!==(url.hostname.startsWith('db.')?role:role+'.'+projectRef))throw new Error();const copy=new URL(raw);copy.username=url.hostname.startsWith('db.')?'postgres':'postgres.'+projectRef;parseSeparatedOwner(copy.toString(),projectRef);return url;}catch{throw new Error('WRONG_TARGET');}}
export function canDiscardSetupTemp(error:unknown,stage:string,committed:boolean){
 if(committed)return false;
 if(stage==='prepare_file')return true;
 const code=typeof error==='object'&&error!==null&&'code' in error?error.code:error instanceof Error?error.message:undefined;
 return stage==='configure_role'&&['42501','42P18','42704','ROLE_ALREADY_CONFIGURED','ROLE_UNSAFE'].includes(typeof code==='string'?code:'');
}
export async function cleanupOwnedSetupTemp(error:unknown,stage:string,committed:boolean,owned:boolean,remove:()=>Promise<void>){if(owned&&canDiscardSetupTemp(error,stage,committed))await remove();}
