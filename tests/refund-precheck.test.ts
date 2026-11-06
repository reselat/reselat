import {expect,it} from 'vitest';
import {refundKey,refundLabels,type RefundReport} from '@/modules/business/refund-schema';
import {validateRefundPrecheck,refundAiAnswer} from '@/modules/business/refund-precheck';
const id='00000000-0000-4000-8000-000000000001';
const report=():RefundReport=>({orderId:id,orderNo:'SYNTHETIC',createdAt:new Date().toISOString(),complete:true,warnings:[],files:[],items:refundKey.options.map(key=>({key,label:refundLabels[key],status:'reviewed',version:1,reference:'',reason:'',fileIds:[id]}))});
const answer=()=>({decision:'passed',summary:'本次资料目录已覆盖，仍需人工核对原件。',issues:[],checkedItems:refundKey.options});
it('never trusts model approval when mechanical checks, attachments or coverage are missing',()=>{
 const missing=report();missing.items[0].status='missing';missing.complete=false;expect(validateRefundPrecheck(answer(),missing).decision).toBe('needs_info');
 expect(validateRefundPrecheck({...answer(),checkedItems:['customs']},report()).decision).toBe('needs_info');
 const noFiles=report();noFiles.items[0].fileIds=[];expect(validateRefundPrecheck(answer(),noFiles).decision).toBe('needs_info');
});
it('passes only the checked snapshot and explicitly excludes original-document and tax approval',()=>{
 const result=validateRefundPrecheck(answer(),report());expect(result.decision).toBe('passed');expect(result.originalsInspected).toBe(false);expect(result.scope).toBe('redacted_checklist');
 expect(()=>validateRefundPrecheck({...answer(),decision:'tax_approved'},report())).toThrow();
});

it('keeps deterministic warnings once during stored-result revalidation and before the cap',()=>{const incomplete=report();incomplete.items[0].status='missing';incomplete.complete=false;const raw={...answer(),issues:Array.from({length:20},(_,i)=>({key:'general',message:'SYNTHETIC model suggestion '+i}))};const first=validateRefundPrecheck(raw,incomplete),second=validateRefundPrecheck(refundAiAnswer.strip().parse(first),incomplete);expect(second).toEqual(first);expect(first.issues).toHaveLength(20);expect(first.issues[0].key).toBe(incomplete.items[0].key);expect(first.issues.some(i=>i.message.includes('机械核对'))).toBe(true);});
