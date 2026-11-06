import {z} from 'zod';
import {DILIGENCE_AGREEMENT_THRESHOLD} from './diligence-fusion';

export const outreachDraftSchema=z.object({
 subject:z.string().trim().min(1).max(500),
 body:z.string().trim().min(1).max(10000),
}).strict();
export const outreachReviewSchema=outreachDraftSchema.extend({
 seatId:z.string().trim().min(1).max(100).refine(id=>id!=='generator'),
 blockers:z.array(z.string().trim().min(1).max(1000)).max(100),
}).strict();
export type OutreachDraft=z.infer<typeof outreachDraftSchema>;
export type OutreachReview=z.infer<typeof outreachReviewSchema>;
export type OutreachContext={leadId:string;reportId:string;summary:string};
const sensitive=/(认证|独家|唯一授权|精确报价|certifi|\bISO\b|\bCE\b|exclusiv|(?:报价|单价|价格|price|quote|USD|CNY|EUR|[$¥€])[^\n]{0,30}\d|\d[\d.,]*\s*(?:USD|CNY|EUR|RMB|dollars?|euros?|元|美元|欧元|人民币|per\s+(?:unit|piece|kg|ton)))/i;

function sentences(text:string){
 return text.split(/[\n。！？!?]+/).map(s=>s.trim()).filter(Boolean);
}

export function fuseOutreach(rawDraft:OutreachDraft,rawReviews:OutreachReview[],summary:string){
 const draft=outreachDraftSchema.parse(rawDraft);
 const reviews=z.array(outreachReviewSchema).max(20).parse(rawReviews);
 z.string().trim().min(1).parse(summary);
 if(new Set(reviews.map(r=>r.seatId)).size!==reviews.length)throw Error('DUPLICATE_SEAT');
 const seats=[draft,...reviews];
 const supportedSentences=new Set(sentences(summary));
 const blockers=reviews.flatMap(r=>r.blockers.map(b=>`${r.seatId} ${b}`));
 if(!reviews.length)blockers.push('缺少独立审计席');
 // Every sensitive sentence must be covered by the accepted report itself.
 for(const seat of seats){
  for(const sentence of sentences(`${seat.subject}\n${seat.body}`)){
   if(sensitive.test(sentence)&&!supportedSentences.has(sentence))blockers.push(`背调未覆盖敏感声明 ${sentence}`);
   if(/未知|待核实|待人工核查|unknown|unverified/i.test(sentence))blockers.push(`待核实 ${sentence}`);
  }
 }
 // Keep the submitted version for human review. Disagreement never silently rewrites it.
 const agreement_ratio=Math.min(...(['subject','body'] as const).map(key=>seats.filter(s=>s[key]===draft[key]).length/seats.length));
 if(seats.some(s=>s.subject!==draft.subject||s.body!==draft.body))blockers.push('开发信席位分歧，待核实');
 const uniqueBlockers=[...new Set(blockers)].sort();
 const high=agreement_ratio>=DILIGENCE_AGREEMENT_THRESHOLD&&!uniqueBlockers.length;
 return {...draft,agreement_ratio,confidence:high?'high' as const:'low' as const,status:high?'auto_approved' as const:'needs_human' as const,blockers:uniqueBlockers};
}
export interface OutreachSeat<T>{
 id:string;
 run(context:OutreachContext,draft?:OutreachDraft):Promise<T>;
}
export function fixtureOutreachSeat<T>(id:string,output:T):OutreachSeat<T>{
 return {id,async run(){return structuredClone(output);}};
}
export async function runOutreachSeats(context:OutreachContext,generator:OutreachSeat<OutreachDraft>,auditors:OutreachSeat<OutreachReview>[]){
 if(generator.id!=='generator'||!auditors.length||new Set([generator.id,...auditors.map(s=>s.id)]).size!==auditors.length+1)throw Error('INVALID_SEATS');
 z.string().trim().min(1).parse(context.summary);
 z.uuid().parse(context.reportId);
 const draft=outreachDraftSchema.parse(await generator.run(context));
 const reviews:OutreachReview[]=[];
 for(const seat of auditors){
  const review=outreachReviewSchema.parse(await seat.run(context,draft));
  if(review.seatId!==seat.id)throw Error('INVALID_SEAT');
  reviews.push(review);
 }
 return {draft,reviews};
}
