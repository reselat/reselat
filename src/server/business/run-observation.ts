import {z} from 'zod';
const amount=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const receipt=z.object({input_tokens:amount,output_tokens:amount,estimated_usd_micros:amount});
type UsageReceipt=z.infer<typeof receipt>;
export function summarizeUsage(receipts:UsageReceipt[]=[]){
 const totals={input_tokens:0,output_tokens:0,estimated_usd_micros:0};
 for(const raw of receipts){const r=receipt.parse(raw);for(const key of ['input_tokens','output_tokens','estimated_usd_micros'] as const)totals[key]=amount.parse(totals[key]+r[key]);}
 return {source:receipts.length?'receipts':'placeholder',currency:'USD',calls:receipts.length,...totals};
}
const roles:Record<string,string>={leads_upsert:'prospecting',maps_search:'prospecting',maps_import:'prospecting',diligence_save_report:'diligence',outreach_draft_email:'outreach_draft',outreach_submit_approval:'outreach_draft'};
function timestamp(value:unknown){if(!(typeof value==='string'||value instanceof Date))return null;const n=new Date(value).getTime();return Number.isFinite(n)?n:null;}
export function buildRunObservation(run:Record<string,unknown>,steps:Record<string,unknown>[]){
 let previous=timestamp(run.started_at);
 const timeline=[...steps].sort((a,b)=>{const ta=timestamp(a.created_at),tb=timestamp(b.created_at);return ta!==null&&tb!==null?ta-tb||Number(a.seq)-Number(b.seq):Number(a.seq)-Number(b.seq);}).map(step=>{
 const end=timestamp(step.created_at),duration_ms=previous!==null&&end!==null&&end>=previous?end-previous:null;
 previous=end;
 const evidence=step.evidence as {id?:unknown}|null;
 return {seq:Number(step.seq),role_code:String(step.role_code??roles[String(step.kind)]??'unknown'),action:String(step.kind??''),state:String(step.state??''),evidence_summary:typeof evidence?.id==='string'?evidence.id:'无证据 ID',duration_ms,created_at:step.created_at??null};
 });
 // No model calls are linked to orchestration runs yet. Never borrow company/day totals.
 return {timeline,usage:summarizeUsage()};
}
