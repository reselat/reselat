import {stdin,stdout} from 'node:process';
import {readFile,writeFile,rename,chmod,open,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {hiddenInputState,consumeHiddenInput} from './hidden-input.ts';
import {parseLocalEnv} from './separated-setup.ts';
import {validateAuthAdminKey,replaceAdminKey} from './auth-admin-config.ts';
const envPath=fileURLToPath(new URL('../.env.local',import.meta.url));
function hiddenInput(){return new Promise((resolve,reject)=>{if(!stdin.isTTY){reject(new Error('TTY_REQUIRED'));return;}stdout.write('测试项目服务端 secret key（不回显）：');let state=hiddenInputState();stdin.setRawMode(true);stdin.resume();stdin.setEncoding('utf8');function finish(){stdin.off('data',onData);stdin.setRawMode(false);stdin.pause();stdout.write('\n');}function onData(chunk){try{state=consumeHiddenInput(state,chunk);if(state.cancelled)throw new Error('CANCELLED');if(state.done){finish();resolve(state.value);}}catch(error){finish();reject(error);}}stdin.on('data',onData);});}
let lock;
try{
 console.log('仅配置外贸测试项目的员工创建服务；不会创建账号、发送邮件或输出密钥。');
 const key=validateAuthAdminKey(await hiddenInput());
 lock=await open(envPath+'.config.lock','wx',0o600);const original=await readFile(envPath,'utf8');
 const env=parseLocalEnv(original);
 if(env.IDENTITY_PROJECT_REF!=='qgbsikqgunmsipegkvda'||env.NEXT_PUBLIC_SUPABASE_URL!=='https://qgbsikqgunmsipegkvda.supabase.co')throw new Error('WRONG_PROJECT');
 const next=replaceAdminKey(original,key);const temp=envPath+'.auth-setup.tmp';await writeFile(temp,next,{mode:0o600});await chmod(temp,0o600);await rename(temp,envPath);await chmod(envPath,0o600);
 console.log('完成：服务端密钥已保存至本机受保护配置。请重启开发服务。未创建任何员工。');
}catch(e){const allowed=['TTY_REQUIRED','CANCELLED','INVALID_ADMIN_KEY','WRONG_PROJECT','ENOENT','EACCES'];const code=e instanceof Error&&allowed.includes(e.message)?e.message:typeof e==='object'&&e!==null&&'code' in e&&allowed.includes(e.code)?e.code:'CONFIGURATION_FAILED';console.error('配置未完成：'+code+'。不要发送密钥或原始错误。');process.exitCode=1;}finally{if(lock){await lock.close().catch(()=>{});await unlink(envPath+'.config.lock').catch(()=>{});}}
