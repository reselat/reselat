import {createHash} from 'node:crypto';
export {assertPrecision} from '@/domain/precision';
function canonical(input:unknown):string{
 if(input===null)return 'null';if(typeof input==='string'||typeof input==='boolean')return JSON.stringify(input);
 if(typeof input==='number'){if(!Number.isFinite(input))throw new Error('INVALID_COMMAND');return JSON.stringify(input);}
 if(Array.isArray(input))return '['+input.map(canonical).join(',')+']';
 if(typeof input==='object'){return '{'+Object.entries(input).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>JSON.stringify(key)+':'+canonical(value)).join(',')+'}';}
 throw new Error('INVALID_COMMAND');
}
export const commandFingerprint=(input:unknown)=>createHash('sha256').update(canonical(input)).digest('hex');
