import {z} from 'zod';
import {uuid} from './schemas';
export const originIds=z.array(uuid).max(10);
export const originRef=z.object({id:uuid,name:z.string(),mime:z.enum(['application/pdf','image/png','image/jpeg']),size:z.number().int().positive().max(10485760),sha256:z.string().regex(/^[a-f0-9]{64}$/),source:z.enum(['product','supplier'])});
export const recordOriginsDTO=z.object({version:z.number().int().positive(),files:z.array(z.object({id:uuid,name:z.string(),mime:z.string(),size:z.number(),state:z.string(),active:z.boolean()}))});
export const orderOriginsDTO=z.array(originRef);
