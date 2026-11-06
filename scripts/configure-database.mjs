// Retired after approval of independent identity and business databases.
if(process.stdin.isTTY){console.error('旧单库配置向导已停用。请使用configure-separated-databases.mjs按用途配置；不要继续在此输入凭据。');process.exit(1);}
import {hiddenInputState,consumeHiddenInput} from './hidden-input.ts';
import {resolve} from 'node:path';
import {databaseTls} from './database-tls.ts';
import {randomBytes} from 'node:crypto';
import {readFile,writeFile,rename,chmod} from 'node:fs/promises';
import {stdin,stdout} from 'node:process';
import {fileURLToPath} from 'node:url';
import postgres from 'postgres';
import {safeSetupDiagnostic} from './database-setup-errors.ts';
import {project,company,parseSetupTarget,withDatabasePassword} from './database-setup-target.ts';
const envPath=fileURLToPath(new URL('../.env.local',import.meta.url));
function hiddenInput(prompt){return new Promise((resolve,reject)=>{if(!stdin.isTTY){reject(new Error('TTY_REQUIRED'));return;}stdout.write(prompt);let state=hiddenInputState();stdin.setRawMode(true);stdin.resume();stdin.setEncoding('utf8');function finish(){stdin.off('data',onData);stdin.setRawMode(false);stdin.pause();stdout.write('\n');}function onData(chunk){try{state=consumeHiddenInput(state,chunk);}catch(error){finish();reject(error);return;}if(state.cancelled){finish();reject(new Error('CANCELLED'));}else if(state.done){finish();if(state.controlsRemoved)console.log('已过滤终端粘贴控制符，未输出输入内容。');resolve(state.value);}}stdin.on('data',onData);});}
function replaceEnv(text,key,value){const line=key+'='+JSON.stringify(value);const pattern=new RegExp('^'+key+'=.*$','m');return pattern.test(text)?text.replace(pattern,()=>line):text.trimEnd()+'\n'+line+'\n';}
let owner,runtime;let committed=false;let stage='input';
try{
 stage='load_ca';const caArgument=process.argv.indexOf('--ca');const caValue=caArgument>=0?process.argv[caArgument+1]:(process.env.TRADE_DATABASE_CA_CERT||fileURLToPath(new URL('../assets/certificates/supabase-prod-ca-2021.crt',import.meta.url)));if(caArgument>=0&&(!caValue||caValue.startsWith('--')))throw new Error('TLS_CA_INVALID');const caPath=caValue?resolve(caValue):undefined;const tls=databaseTls(caPath?await readFile(caPath,'utf8'):undefined);stage='input';
 console.log('仅配置外贸独立测试项目。不会读取/导入本机业务资料，不会发送邮件。');
 console.log('请从Connect复制Session pooler的postgres连接串，保留[YOUR-PASSWORD]占位符。密码下一步单独输入，不回显，不保存管理员连接。');
 const input=await hiddenInput('数据库管理员连接串（不回显）：');
 stage='parse';let url=parseSetupTarget(input);if(decodeURIComponent(url.password)==='[YOUR-PASSWORD]'){stage='password';url=withDatabasePassword(input,await hiddenInput('数据库密码（不是员工密码，不回显）：'));}const username=decodeURIComponent(url.username);

 stage='connect';owner=postgres(url.toString(),{max:1,prepare:false,connect_timeout:15,ssl:tls,debug:false,onnotice:()=>{}});
 console.log('目标项目：'+project+'；连接类型：'+(url.hostname.endsWith('.pooler.supabase.com')?'会话池':'项目直连')+'；主机：'+url.hostname);
 const roleRows=await owner`select rolcanlogin,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls from pg_roles where rolname='app_backend'`;
 if(process.argv.includes('--check-only')){console.log('认证检查通过：已连接目标数据库；未修改角色、密码或本机配置。');}else{
 stage='check_role';if(!roleRows[0])throw new Error('ROLE_MISSING');if(roleRows[0].rolcanlogin)throw new Error('ROLE_ALREADY_CONFIGURED');if(roleRows[0].rolsuper||roleRows[0].rolcreaterole||roleRows[0].rolcreatedb||roleRows[0].rolbypassrls)throw new Error('ROLE_UNSAFE');
 stage='check_company';const matches=await owner`select id from trade_private.companies where id=${company}`;if(!matches.length)throw new Error('COMPANY_NOT_FOUND');
 const password=randomBytes(36).toString('base64url');
 const runtimeUrl=new URL(url.toString());runtimeUrl.username=username==='postgres'?'app_backend':'app_backend.'+project;runtimeUrl.password=password;
 stage='prepare_file';const original=await readFile(envPath,'utf8');
 let next=replaceEnv(replaceEnv(original,'TRADE_DATABASE_URL',runtimeUrl.toString()),'TRADE_COMPANY_ID',company);
 if(caPath)next=replaceEnv(next,'TRADE_DATABASE_CA_CERT',caPath);
 const temp=envPath+'.setup.tmp';await writeFile(temp,next,{mode:0o600});await chmod(temp,0o600);
 stage='configure_role';await owner.begin(async tx=>{await tx`select pg_advisory_xact_lock(hashtext('trade_initial_connection_setup'))`;const rows=await tx`select rolcanlogin from pg_roles where rolname='app_backend'`;if(rows[0]?.rolcanlogin)throw new Error('ROLE_ALREADY_CONFIGURED');const statement=await tx`select format('alter role app_backend login password %L',${password}::text) as command`;await tx.unsafe(statement[0].command);});committed=true;
 stage='save_file';await rename(temp,envPath);await chmod(envPath,0o600);
 stage='verify';runtime=postgres(runtimeUrl.toString(),{max:1,prepare:false,connect_timeout:15,ssl:tls,debug:false,onnotice:()=>{}});
 const check=await runtime`select current_user as role,(select count(*)::int from trade_private.employees where company_id=${company} and role='admin' and enabled) as admins`;
 if(check[0]?.role!=='app_backend'||check[0]?.admins!==1)throw new Error('CONNECTION_VERIFICATION_FAILED');
 console.log('完成：专用低权限连接已保存至本机.env.local，管理员连接未保存。请重启开发服务，再登录并绑定双重验证。');
 }
}catch(error){
 console.error(safeSetupDiagnostic(error,stage,committed));process.exitCode=1;
}finally{if(runtime)await runtime.end({timeout:3});if(owner)await owner.end({timeout:3});}
