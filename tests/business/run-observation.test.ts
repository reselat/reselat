import {it,expect} from 'vitest';
import {buildRunObservation,summarizeUsage} from '@/server/business/run-observation';
it('sorts immutable steps and derives roles, safe evidence and observed intervals',()=>{
 const steps=[{seq:1,kind:'diligence_save_report',state:'succeeded',evidence:{id:'report',secret:'hidden'},created_at:'2026-11-05T00:00:03Z'},{seq:0,kind:'leads_upsert',state:'succeeded',evidence:{id:'lead'},created_at:'2026-11-05T00:00:01Z'}];
 const before=JSON.stringify(steps);
 const result=buildRunObservation({started_at:'2026-11-05T00:00:00Z'},steps);
 expect(result.timeline.map(s=>[s.seq,s.role_code,s.duration_ms,s.evidence_summary])).toEqual([[0,'prospecting',1000,'lead'],[1,'diligence',2000,'report']]);
 expect(JSON.stringify(steps)).toBe(before);
 expect(result.usage).toMatchObject({source:'placeholder',calls:0,input_tokens:0,output_tokens:0,estimated_usd_micros:0,currency:'USD'});
 expect(buildRunObservation({},[{seq:0,kind:'unknown',evidence:{}}]).timeline[0]).toMatchObject({role_code:'unknown',duration_ms:null,evidence_summary:'无证据 ID'});
});
it('aggregates explicit usage receipts with integer micro-USD and rejects invalid amounts',()=>{
 expect(summarizeUsage([{input_tokens:120,output_tokens:30,estimated_usd_micros:5},{input_tokens:80,output_tokens:20,estimated_usd_micros:7}])).toMatchObject({source:'receipts',calls:2,input_tokens:200,output_tokens:50,estimated_usd_micros:12});
 for(const n of [-1,NaN,Infinity,1.5])expect(()=>summarizeUsage([{input_tokens:n,output_tokens:0,estimated_usd_micros:0}])).toThrow();
});
