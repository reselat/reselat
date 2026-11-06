import {z} from 'zod';
export const profileSchema=z.object({name:z.string().trim().min(1).max(80),phone:z.string().trim().max(40).regex(/^[+()\d\s.-]*$/)}).strict();
export function requiresMfa(role:string,factors:readonly {status?:string}[]|undefined,aal:unknown){return false;}
export function canRemoveFactor(factors:readonly {id:string;status:string}[],id:string){return factors.some(f=>f.id===id)&&(!factors.some(f=>f.id===id&&f.status==='verified')||factors.some(f=>f.id!==id&&f.status==='verified'));}
