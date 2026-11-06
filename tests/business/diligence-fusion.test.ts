import { freshnessClaims, freshnessEvidence } from '../helpers/diligence-freshness';
import {expect,it} from 'vitest';
import {fuseDiligence,runDiligenceSeats,fixtureSeat,type Draft,type Review} from '@/modules/business/diligence-fusion';
const draft:Draft={summary:'公司经营机械',claims:[...freshnessClaims(),{key:'business',value:'机械',sources:[]}]};
const review=(seatId:string,value='机械'):Review=>({seatId,summary:'已核对',claims:[...freshnessClaims(),{key:'business',value,sources:[]}],blockers:[]});
it('uses agreement across independent seats and a configurable threshold',()=>{
 expect(fuseDiligence(draft,[review('a')],freshnessEvidence)).toMatchObject({status:'auto_accepted',agreement_ratio:1});
 expect(fuseDiligence(draft,[review('a')],freshnessEvidence,1)).toMatchObject({status:'auto_accepted'});
 expect(fuseDiligence(draft,[],freshnessEvidence).status).toBe('needs_human');
 expect(()=>fuseDiligence(draft,[review('a'),review('a')],freshnessEvidence)).toThrow();
});
it('ranks sourced evidence over consensus but records disagreement for human review',()=>{
 const result=fuseDiligence(draft,[review('a'),{...review('b','电子'),claims:[{key:'business',value:'电子',sources:['e1']}]}],[...freshnessEvidence,{id:'e1',text:'经营电子',url:'https://example.com'}]);
 expect(result.summary).toContain('电子');
 expect(result.summary).toContain('待核实');
 expect(result).toMatchObject({status:'needs_human',agreement_ratio:1/3});
});
it('blocks unsupported sensitive claims and invalid references, including raw summaries',()=>{
 for(const summary of ['已获 ISO 认证','独家代理','报价 USD 12.30']){
  expect(fuseDiligence({...draft,summary},[review('a')],freshnessEvidence).blockers.length).toBeGreaterThan(0);
 }
 expect(()=>fuseDiligence(draft,[{...review('a'),claims:[{key:'business',value:'机械',sources:['missing']}]}],freshnessEvidence)).toThrow();
 expect(fuseDiligence(draft,[{...review('a'),blockers:['敏感风险']}],freshnessEvidence).status).toBe('needs_human');
});
it('runs injectable fixture seats without network access',async()=>{
 const result=await runDiligenceSeats({leadId:crypto.randomUUID(),evidence:[]},fixtureSeat('generator',draft),[fixtureSeat('audit',review('audit'))]);
 expect(fuseDiligence(result.draft,result.reviews,freshnessEvidence).status).toBe('auto_accepted');
});
it('accepts exactly two thirds with no conflicting values and leaves missing claims traceable',()=>{
 const expanded={...draft,claims:[...draft.claims,{key:'country',value:'中国',sources:[]}]};
 const reviews=[{...review('a'),claims:expanded.claims},review('b')];
 expect(fuseDiligence(expanded,reviews,freshnessEvidence)).toMatchObject({status:'auto_accepted',agreement_ratio:2/3});
 expect(fuseDiligence(expanded,reviews,freshnessEvidence,0.8).status).toBe('needs_human');
});
it('retains unknowns for human verification even when seats agree',()=>{
 const unknown={summary:'未知，待人工核查',claims:[...freshnessClaims(),{key:'背景',value:'未知，待人工核查',sources:[]}]};
 expect(fuseDiligence(unknown,[{...unknown,seatId:'a',blockers:[]}],freshnessEvidence).status).toBe('needs_human');
});
it('fails closed for empty or duplicate claims, invalid evidence, thresholds and malformed seats',async()=>{
 expect(()=>fuseDiligence({...draft,claims:[]},[review('a')],freshnessEvidence)).toThrow();
 expect(()=>fuseDiligence({...draft,claims:[...draft.claims,...draft.claims]},[review('a')],freshnessEvidence)).toThrow();
 expect(()=>fuseDiligence(draft,[review('a')],[...freshnessEvidence,{id:'x',text:'x'},{id:'x',text:'y'}])).toThrow();
 expect(()=>fuseDiligence(draft,[review('a')],freshnessEvidence,Number.NaN)).toThrow();
 await expect(runDiligenceSeats({leadId:'lead',evidence:[]},fixtureSeat('generator',draft),[fixtureSeat('a',review('other'))])).rejects.toThrow('INVALID_SEAT');
});
it('ranks two-seat agreement above a single inference with deterministic order',()=>{
 const result=fuseDiligence(draft,[review('b','电子'),review('a','电子')],freshnessEvidence);
 expect(result.summary).toContain('business 电子 [多席一致]');
 expect(result).toEqual(fuseDiligence(draft,[review('a','电子'),review('b','电子')],freshnessEvidence));
});
it.each(['认证 ISO9001','独家授权','单价为12元','price is 12.30','报价为12.30元'])('blocks unsupported assertion %s',value=>{
 const sensitive={summary:'公司资料',claims:[...freshnessClaims(),{key:'claim',value,sources:[]}]};
 expect(fuseDiligence(sensitive,[{...sensitive,seatId:'a',blockers:[]}],freshnessEvidence).status).toBe('needs_human');
});
it('accepts a sensitive claim with a traceable source',()=>{
 const supported={summary:'公司资料',claims:[...freshnessClaims(),{key:'certificate',value:'认证 ISO9001',sources:['e1']}]};
 expect(fuseDiligence(supported,[{...supported,seatId:'a',blockers:[]}],[...freshnessEvidence,{id:'e1',text:'证书原文'}]).status).toBe('auto_accepted');
});
it.each([['ISO认证','已通过'],['独家代理','是'],['单价','12元']])('blocks unsupported sensitive field %s', (key,value)=>{
 const sensitive={summary:'已核对',claims:[...freshnessClaims(),{key,value,sources:[]}]};
 expect(fuseDiligence(sensitive,[{...sensitive,seatId:'a',blockers:[]}],freshnessEvidence).status).toBe('needs_human');
});
