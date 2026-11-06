import {z} from 'zod';
import {uuid} from '@/modules/business/schemas';
import {checkAdmin} from '@/server/auth/employee';
import type {BusinessActor} from '@/server/business/access';
import {profileRow,profileFingerprint} from './profiles';
import {runAiTask} from './tasks';
export async function testModelConnection(actor:BusinessActor,raw:unknown){checkAdmin(actor,actor.aal);const input=z.object({requestId:uuid,id:uuid}).strict().parse(raw);return runAiTask(actor,{requestId:input.requestId,orderId:null},{task:'connection_test',subjectId:input.id,context:async tx=>{checkAdmin(actor,actor.aal);const p=await profileRow(tx,actor.companyId,input.id);if(p.archived||!p.enabled)throw new Error('AI_MODEL_UNAVAILABLE');return {fingerprint:profileFingerprint(p),messages:[{role:'system',content:'这是模型连接及JSON能力测试。只输出JSON：{"ok":true}。不要包含任何其他内容。'},{role:'user',content:'请返回连接测试JSON。'}]};},decode:raw=>{z.object({ok:z.literal(true)}).strict().parse(raw);return {ok:true,summary:'真实模型调用及JSON输出测试通过。'};}});}
