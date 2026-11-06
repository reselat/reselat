import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {existsSync} from 'node:fs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),port=3120;
if(!existsSync(resolve(root,'node_modules/next/dist/bin/next'))){console.error('请先在项目目录运行 npm ci --ignore-scripts');process.exit(1);}
const env={...process.env};for(const key of Object.keys(env))if(/SUPABASE|DATABASE|AI_|DEEPSEEK|VERCEL|STORAGE_ADMIN|AUTH_ADMIN/.test(key))delete env[key];
Object.assign(env,{NODE_ENV:'development',RESELAT_LOCAL_TEST:'1',NEXT_PUBLIC_RESELAT_LOCAL_TEST:'1',APP_ORIGIN:'http://127.0.0.1:'+port,TRADE_COMPANY_ID:'10000000-0000-4000-8000-000000000001',FILE_STORAGE_DRIVER:'filesystem',DEPLOYMENT_TARGET:'self-hosted',PRIVATE_FILES_ROOT:resolve(root,'.local-test-data/files')});
console.log('RESELAT · 本机测试版 http://127.0.0.1:'+port+'/login');
const child=spawn(process.execPath,[resolve(root,'node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port',String(port)],{cwd:root,env,stdio:'inherit'});for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));child.on('exit',code=>{process.exitCode=code??0;});
