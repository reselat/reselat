import {expect,it} from 'vitest';
import {fuseOutreach,fixtureOutreachSeat,runOutreachSeats} from '@/modules/business/outreach-fusion';
const draft={subject:'合作交流',body:'了解到贵司经营机械，期待交流需求。'};
const context={leadId:crypto.randomUUID(),reportId:crypto.randomUUID(),summary:'经营机械'};
const review={seatId:'audit',...draft,blockers:[]};
it('requires an independent auditor and deterministic agreement',()=>{
 expect(fuseOutreach(draft,[review],context.summary)).toMatchObject({confidence:'high',agreement_ratio:1,blockers:[]});
 expect(fuseOutreach(draft,[],context.summary).confidence).toBe('low');
 expect(fuseOutreach(draft,[{...review,body:'不同正文'}],context.summary).confidence).toBe('low');
 expect(()=>fuseOutreach(draft,[review,review],context.summary)).toThrow('DUPLICATE_SEAT');
});
it.each(['ISO 9001 certified','独家代理','Price USD 12.50','CE认证'])('blocks unsupported sensitive text %s',body=>{
 expect(fuseOutreach({...draft,body},[{...review,body}],context.summary).confidence).toBe('low');
 expect(fuseOutreach({...draft,body},[{...review,body}],body).confidence).toBe('high');
});
it('supports fixture seats without API keys',async()=>{
 const result=await runOutreachSeats(context,fixtureOutreachSeat('generator',draft),[fixtureOutreachSeat('audit',review)]);
 expect(fuseOutreach(result.draft,result.reviews,context.summary).confidence).toBe('high');
 await expect(runOutreachSeats(context,fixtureOutreachSeat('generator',draft),[fixtureOutreachSeat('other',review)])).rejects.toThrow('INVALID_SEAT');
});
it.each(['Our offer is 12.50 USD per unit','每件12元','12 dollars each','每件报价12','12 per unit'])('blocks currency-suffix and unit quotes %s',body=>{
 expect(fuseOutreach({...draft,body},[{...review,body}],context.summary).confidence).toBe('low');
});
it('does not borrow support from a negated or longer report sentence',()=>{
 const body='取得ISO认证';
 for(const summary of ['尚未取得ISO认证','客户声称取得ISO认证但尚待核实']){
  expect(fuseOutreach({...draft,body},[{...review,body}],summary).confidence).toBe('low');
 }
});
