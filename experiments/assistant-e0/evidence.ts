export type Capability = 'conversation_identity'|'read_text'|'send_text'|'delivery_receipt'|'human_takeover'|'reconnect'|'model_call_coverage'|'pdf_extraction';
export type Evidence = {capability:Capability; environment:'mock'|'real_test'; outcome:'pass'|'fail'|'not_run'; reference:string; revision:string};
export function assessCapability(items:Evidence[]):'supported'|'unsupported'|'unverified'{
 const real=items.filter(x=>x.environment==='real_test');
 if(!real.length||real.some(x=>!x.reference.trim()||!x.revision.trim())||new Set(real.map(x=>x.capability)).size!==1||new Set(real.map(x=>x.revision)).size!==1)return 'unverified';
 if(real.some(x=>x.outcome==='fail'))return 'unsupported';
 return real.every(x=>x.outcome==='pass')?'supported':'unverified';
}
