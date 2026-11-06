import {z} from 'zod';
import {refundKey,type RefundReport} from './refund-schema';
export const precheckStatus=z.enum(['not_reviewed','running','needs_info','passed','failed','stale']);
export const precheckLabels:Record<z.infer<typeof precheckStatus>,string>={not_reviewed:'待AI预审',running:'AI预审中',needs_info:'需要补充',passed:'AI清单预审通过',failed:'预审异常／待核对',stale:'资料版本已变化'};
export const refundAiAnswer=z.object({decision:z.enum(['needs_info','passed']),summary:z.string().trim().min(1).max(1800),issues:z.array(z.object({key:z.enum([...refundKey.options,'general']),message:z.string().trim().min(1).max(500)}).strict()).max(20),checkedItems:z.array(refundKey).max(7)}).strict();
export function validateRefundPrecheck(raw:unknown,report:RefundReport){const answer=refundAiAnswer.parse(raw),issues:typeof answer.issues=[];
 for(const item of report.items)if(!['reviewed','not_applicable'].includes(item.status)||(item.status==='reviewed'&&!item.fileIds.length)||(item.status==='not_applicable'&&!item.reason.trim()))issues.push({key:item.key,message:'该项尚未完成文件关联、人工复核或不适用说明。'});
 if(!report.complete||report.warnings.length)issues.push({key:'general',message:'机械核对仍有未完成项；请先核对当前资料清单提示。'});
 if(new Set(answer.checkedItems).size!==7)issues.push({key:'general',message:'本次模型没有覆盖全部七类资料，不能标记预审通过。'});
 const unique=[...new Map([...issues,...answer.issues].map(issue=>[JSON.stringify([issue.key,issue.message]),issue])).values()];
 return {...answer,decision:unique.length||answer.decision==='needs_info'?'needs_info' as const:'passed' as const,issues:unique.slice(0,20),scope:'redacted_checklist' as const,originalsInspected:false as const};
}
export const refundPackListDTO=z.object({items:z.array(z.object({id:z.string().uuid(),format:z.string(),state:z.string(),fileId:z.string().uuid().nullable(),createdAt:z.string(),complete:z.boolean(),precheckStatus,answer:z.object({decision:z.enum(['needs_info','passed']),summary:z.string(),issues:z.array(z.object({key:z.string(),message:z.string()})),scope:z.literal('redacted_checklist'),originalsInspected:z.literal(false)}).nullable()})),hasMore:z.boolean()});
