import {randomUUID,createHash} from 'node:crypto';
import {read,write} from './business-read.mjs';
const owner=randomUUID();

import {createTick} from './tick.mjs';
const tick=createTick({read,write,owner});
let busy=false;
const loop=async()=>{if(busy)return;busy=true;try{await tick();}catch{process.stderr.write('Host command failed; inspect run before requeue\n');}finally{busy=false;}};
loop();const timer=setInterval(loop,Math.max(1000,Number(process.env.AGENT_INTERVAL_MS)||15000));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);process.exitCode=0;});
