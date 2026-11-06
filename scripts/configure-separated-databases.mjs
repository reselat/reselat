import postgres from 'postgres';
import {randomBytes} from 'node:crypto';
import {stdin,stdout} from 'node:process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {readFile,writeFile,rename,chmod,open,unlink} from 'node:fs/promises';
import {hiddenInputState,consumeHiddenInput} from './hidden-input.ts';
import {databaseTls} from './database-tls.ts';
import {parseSeparatedOwner,parseLocalEnv,replaceSeparatedEnv,validateSavedTarget,cleanupOwnedSetupTemp} from './separated-setup.ts';
const envPath=fileURLToPath(new URL('../.env.local',import.meta.url));
function argument(name){const index=process.argv.indexOf(name);return index<0?undefined:process.argv[index+1];}
function promptHidden(prompt){return new Promise((resolve,reject)=>{if(!stdin.isTTY){reject(new Error('TTY_REQUIRED'));return;}stdout.write(prompt);let state=hiddenInputState();stdin.setRawMode(true);stdin.resume();stdin.setEncoding('utf8');function finish(){stdin.off('data',onData);stdin.setRawMode(false);stdin.pause();stdout.write('\n');}function onData(chunk){try{state=consumeHiddenInput(state,chunk);if(state.cancelled)throw new Error('CANCELLED');if(state.done){finish();resolve(state.value);}}catch(e){finish();reject(e);}}stdin.on('data',onData);});}
let owner,runtime,lock,tempPath;let tempOwned=false;let committed=false,stage='arguments';const purpose=argument('--purpose');
try{
 const ref=argument('--project-ref');if(!['identity','business'].includes(purpose)||!ref||!/^[a-z0-9]{20}$/.test(ref))throw new Error('INVALID_ARGUMENTS');
 if(!process.argv.includes('--verify-saved')&&!process.argv.includes('--recover-config')&&!stdin.isTTY)throw new Error('TTY_REQUIRED');
 if(purpose==='identity'&&ref!=='qgbsikqgunmsipegkvda')throw new Error('WRONG_TARGET');
 console.log('仅配置'+(purpose==='identity'?'身份权限库':'独立业务库')+'。不创建员工、不导入资料、不发送邮件。');
 lock=await open(envPath+'.config.lock','wx',0o600);const original=await readFile(envPath,'utf8'),env=parseLocalEnv(original),prefix=purpose==='identity'?'IDENTITY':'BUSINESS';
 const identityRef=purpose==='identity'?ref:env.IDENTITY_PROJECT_REF,otherRef=purpose==='identity'?env.BUSINESS_PROJECT_REF:identityRef;
 if(!identityRef||identityRef=== (purpose==='business'?ref:otherRef)||env.NEXT_PUBLIC_SUPABASE_URL!=='https://'+identityRef+'.supabase.co')throw new Error('WRONG_TARGET');
 const caPath=resolve(argument('--ca')||env[prefix+'_DATABASE_CA_CERT']||fileURLToPath(new URL('../assets/certificates/supabase-prod-ca-2021.crt',import.meta.url)));
 stage='tls';const ssl=databaseTls(await readFile(caPath,'utf8')),options={max:1,prepare:false,connect_timeout:15,ssl,onnotice:()=>{},debug:false};
 async function checkMarker(sql){const rows=purpose==='identity'?await sql`select purpose,project_ref from trade_private.deployment_identity`:await sql`select purpose,project_ref from trade_business.deployment_identity`;if(rows.length!==1||rows[0].purpose!==purpose||rows[0].project_ref!==ref)throw new Error('MARKER_MISMATCH');}
 if(process.argv.includes('--recover-config')){
  stage='recover_config';const pendingPath=envPath+'.'+purpose+'.setup.tmp',pending=parseLocalEnv(await readFile(pendingPath,'utf8'));
  if(pending[prefix+'_PROJECT_REF']!==ref||!pending[prefix+'_DATABASE_URL']||!pending[prefix+'_DATABASE_CA_CERT'])throw new Error('WRONG_TARGET');
  const candidate=validateSavedTarget(pending[prefix+'_DATABASE_URL'],purpose,ref);
  runtime=postgres(candidate.toString(),{...options,ssl:databaseTls(await readFile(pending[prefix+'_DATABASE_CA_CERT'],'utf8'))});await checkMarker(runtime);
  const roles=await runtime`select current_user as role`;if(roles[0]?.role!==purpose+'_backend')throw new Error('ROLE_UNSAFE');
  const merged=replaceSeparatedEnv(original,purpose,{projectRef:ref,url:candidate.toString(),caPath:pending[prefix+'_DATABASE_CA_CERT']});const recoveryPath=envPath+'.'+purpose+'.recover.tmp';
  await writeFile(recoveryPath,merged,{mode:0o600,flag:'wx'});await chmod(recoveryPath,0o600);await rename(recoveryPath,envPath);await chmod(envPath,0o600);await unlink(pendingPath);
  console.log('恢复完成：仅合并已核验的'+purpose+'低权限连接，未改变另一库或重置密码。');
 }else if(process.argv.includes('--verify-saved')){
  stage='verify_saved';const value=env[prefix+'_DATABASE_URL'];if(!value)throw new Error('LOCAL_CONFIG_MISSING');const target=validateSavedTarget(value,purpose,ref);runtime=postgres(target.toString(),options);await checkMarker(runtime);const roles=await runtime`select current_user as role`;if(roles[0]?.role!==purpose+'_backend')throw new Error('ROLE_UNSAFE');console.log('已保存连接核验通过：'+purpose+'；未变更角色、密码或配置。');
 }else{
  stage='input';const raw=await promptHidden('该库管理员连接串（保留[YOUR-PASSWORD]，不回显）：');const target=parseSeparatedOwner(raw,ref);
  if(decodeURIComponent(target.password)==='[YOUR-PASSWORD]'){const password=await promptHidden('该库数据库密码（不回显）：');if(!password)throw new Error('PASSWORD_MISSING');target.password=encodeURIComponent(password);}
  stage='connect';owner=postgres(target.toString(),options);await checkMarker(owner);const role=purpose+'_backend';const roleRows=await owner`select rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls from pg_roles where rolname=${role}`;const row=roleRows[0];if(!row)throw new Error('ROLE_MISSING');if(row.rolsuper||row.rolcreatedb||row.rolcreaterole||row.rolbypassrls)throw new Error('ROLE_UNSAFE');
  if(process.argv.includes('--check-only')){console.log('认证和用途检查通过：'+purpose+'；未变更角色、密码或配置。');}
  else{
   if(row.rolcanlogin)throw new Error('ROLE_ALREADY_CONFIGURED');
   const password=randomBytes(36).toString('base64url'),appUrl=new URL(target);appUrl.username=target.hostname.startsWith('db.')?role:role+'.'+ref;appUrl.password=password;
   const next=replaceSeparatedEnv(original,purpose,{projectRef:ref,url:appUrl.toString(),caPath}),temp=envPath+'.'+purpose+'.setup.tmp';
   stage='prepare_file';tempPath=temp;const file=await open(temp,'wx',0o600);tempOwned=true;try{await file.writeFile(next);await file.chmod(0o600);}finally{await file.close();}
   stage='configure_role';await owner.begin(async tx=>{await tx`select pg_advisory_xact_lock(hashtext('trade_split_connection_setup'))`;const latest=await tx`select rolcanlogin from pg_roles where rolname=${role}`;if(latest[0]?.rolcanlogin)throw new Error('ROLE_ALREADY_CONFIGURED');const statement=await tx`select format('alter role %I login password %L',${role}::text,${password}::text) as command`;await tx.unsafe(statement[0].command);});committed=true;
   stage='save_file';await rename(temp,envPath);await chmod(envPath,0o600);stage='verify';runtime=postgres(appUrl.toString(),options);await checkMarker(runtime);const roles=await runtime`select current_user as role`;if(roles[0]?.role!==role)throw new Error('ROLE_UNSAFE');
   console.log('完成：'+purpose+'独立低权限连接已保存。管理员连接未保存。另一库需独立完成配置，本提示不代表双库全部就绪。');
  }
 }
}catch(error){if(tempPath)await cleanupOwnedSetupTemp(error,stage,committed,tempOwned,()=>unlink(tempPath)).catch(()=>{});const allow=['TTY_REQUIRED','CANCELLED','INVALID_ARGUMENTS','WRONG_TARGET','MARKER_MISMATCH','ROLE_UNSAFE','ROLE_MISSING','ROLE_ALREADY_CONFIGURED','LOCAL_CONFIG_MISSING','LOCAL_CONFIG_INVALID','PASSWORD_MISSING','MULTILINE_INPUT','TERMINAL_INPUT_INVALID','28P01','42501','42P01','42P18','SELF_SIGNED_CERT_IN_CHAIN','EEXIST','EACCES','ENOENT','CONNECT_TIMEOUT','ENOTFOUND'];const value=error instanceof Error&&allow.includes(error.message)?error.message:typeof error==='object'&&error!==null&&'code' in error&&allow.includes(error.code)?error.code:'UNKNOWN';console.error('配置未完成；用途：'+(['identity','business'].includes(purpose)?purpose:'unknown')+'；阶段：'+stage+'；错误码：'+value+'。'+(committed?'该库角色已启用，配置或临时文件已保留。请停止重复初始化，配置已保存时用--verify-saved；保存失败或提交结果未知时用--recover-config核验并恢复临时配置。':'若临时文件仍存在，请用--recover-config核验恢复，勿盲目删除或重置角色。不要发送凭据或原始错误。'));process.exitCode=1;
}finally{if(runtime)await runtime.end({timeout:3}).catch(()=>{});if(owner)await owner.end({timeout:3}).catch(()=>{});if(lock){await lock.close().catch(()=>{});await unlink(envPath+'.config.lock').catch(()=>{});}}
