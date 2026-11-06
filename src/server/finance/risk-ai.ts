import {z} from 'zod';
import {uuid} from '@/modules/business/schemas';
import type {BusinessActor} from '@/server/business/access';
import {readBusiness} from '@/server/business/order-data';
import {runAiTask,reconcileAiTask} from '@/server/ai/tasks';
import {riskContext} from './order-costs';
import {buildRiskPrompt,riskAiAnswer} from './deepseek';
export async function analyseOrderRisk(actor:BusinessActor,raw:unknown){const input=z.object({requestId:uuid,orderId:uuid}).strict().parse(raw),initial=await readBusiness(actor,tx=>riskContext(tx,actor,input.orderId));if(!initial.risks.length)throw new Error('AI_NO_RISKS');
 return runAiTask(actor,input,{task:'order_risk',subjectId:input.orderId,context:async tx=>{const current=await riskContext(tx,actor,input.orderId);return {fingerprint:current.fingerprint,messages:buildRiskPrompt(current.risks)};},decode:value=>{const answer=riskAiAnswer.parse(value),codes=new Set(initial.risks.slice(0,12).map(r=>r.code));if(answer.suggestions.some(s=>!codes.has(s.riskCode)))throw new Error('AI_RESULT_UNKNOWN');return answer;}});
}
export const reconcileRiskAi=reconcileAiTask;
