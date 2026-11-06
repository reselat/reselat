import {z} from 'zod';
export function objectKey(companyId:string,fileId:string){return z.string().uuid().parse(companyId)+'/'+z.string().uuid().parse(fileId);}
export function partKeys(companyId:string,fileId:string){const key=objectKey(companyId,fileId);return Array.from({length:5},(_,i)=>key+'/parts/'+i);}
