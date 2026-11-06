import {connect as tcpConnect} from 'node:net';
import {connect as tlsConnect} from 'node:tls';
import {readFile} from 'node:fs/promises';
import {databaseTls} from './database-tls.ts';
const host=process.argv[2]||'aws-0-ap-southeast-1.pooler.supabase.com';
if(!['aws-0-ap-southeast-1.pooler.supabase.com','db.qgbsikqgunmsipegkvda.supabase.co'].includes(host))throw new Error('PROBE_TARGET_NOT_ALLOWED');
const options=databaseTls(await readFile(new URL('../assets/certificates/supabase-prod-ca-2021.crt',import.meta.url),'utf8'));
await new Promise((resolve,reject)=>{
 const socket=tcpConnect({host,port:5432});let secure;const timer=setTimeout(()=>fail('TLS_TIMEOUT'),15000);
 function fail(code){clearTimeout(timer);secure?.destroy();socket.destroy();reject(new Error(code));}
 socket.once('error',()=>fail('TCP_CONNECTION_FAILED'));
 socket.once('connect',()=>{const request=Buffer.alloc(8);request.writeInt32BE(8,0);request.writeInt32BE(80877103,4);socket.write(request);});
 socket.once('data',data=>{if(data.length!==1||data[0]!==83){fail('POSTGRES_TLS_UNAVAILABLE');return;}secure=tlsConnect({socket,servername:host,...options});secure.once('error',error=>fail(typeof error.code==='string'?error.code:'TLS_FAILED'));secure.once('secureConnect',()=>{if(!secure.authorized){fail('TLS_NOT_AUTHORIZED');return;}clearTimeout(timer);console.log('PASS: CA chain and hostname verified; no password, login or SQL sent.');secure.destroy();resolve();});});
}).catch(error=>{console.error('TLS probe failed:',error.message);process.exitCode=1;});
