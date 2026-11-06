import {stdin,stdout} from 'node:process';
import {readFile,writeFile,rename,chmod,open,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {hiddenInputState,consumeHiddenInput} from './hidden-input.ts';
import {parseLocalEnv} from './separated-setup.ts';
import {createClient} from '@supabase/supabase-js';
import {validateStorageKey,replaceStorageKey} from './business-storage-config.ts';
const envPath=fileURLToPath(new URL('../.env.local',import.meta.url));
function hiddenInput(){return new Promise((resolve,reject)=>{if(!stdin.isTTY){reject(new Error('TTY_REQUIRED'));return;}stdout.write('业务测试项目 Storage secret key（不回显）：');let state=hiddenInputState();stdin.setRawMode(true);stdin.resume();stdin.setEncoding('utf8');function finish(){stdin.off('data',onData);stdin.setRawMode(false);stdin.pause();stdout.write('\n');}function onData(chunk){try{state=consumeHiddenInput(state,chunk);if(state.cancelled)throw new Error('CANCELLED');if(state.done){finish();resolve(state.value);}}catch(error){finish();reject(error);}}stdin.on('data',onData);});}
let lock;
try{
 console.log('仅配置独立业务测试项目私有文件服务；不创建桶、不上传文件、不输出密钥。');
 const key=validateStorageKey(await hiddenInput());
 lock=await open(envPath+'.config.lock','wx',0o600);const original=await readFile(envPath,'utf8');
 const env=parseLocalEnv(original);
 if(env.BUSINESS_PROJECT_REF!=='wjrwqkduohqpqzigmhys'||key===env.SUPABASE_AUTH_ADMIN_KEY)throw new Error('WRONG_PROJECT');
 const client=createClient('https://wjrwqkduohqpqzigmhys.supabase.co',key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,redirect:'error'})}});const {error}=await client.storage.listBuckets();if(error)throw new Error('KEY_VERIFICATION_FAILED');
 const next=replaceStorageKey(original,key);const temp=envPath+'.storage-setup.tmp';await writeFile(temp,next,{mode:0o600,flag:'wx'});await chmod(temp,0o600);await rename(temp,envPath);await chmod(envPath,0o600);
 console.log('完成：业务Storage密钥已核验并保存至本机受保护配置。未创建桶或上传文件。');
}catch(e){const allowed=['TTY_REQUIRED','CANCELLED','INVALID_ADMIN_KEY','WRONG_PROJECT','KEY_VERIFICATION_FAILED','ENOENT','EACCES'];const code=e instanceof Error&&allowed.includes(e.message)?e.message:typeof e==='object'&&e!==null&&'code' in e&&allowed.includes(e.code)?e.code:'CONFIGURATION_FAILED';console.error('配置未完成：'+code+'。不要发送密钥或原始错误。');process.exitCode=1;}finally{if(lock){await lock.close().catch(()=>{});await unlink(envPath+'.config.lock').catch(()=>{});}}
