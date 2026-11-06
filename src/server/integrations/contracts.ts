import {z} from 'zod';
const uuid=z.string().uuid();
// Versioned contracts only. No provider is enabled and no worker performs network calls.
export const financeEvent=z.object({
 schemaVersion:z.literal(1),eventId:uuid,companyId:uuid,
 type:z.enum(['payment.confirmed','payment.voided']),paymentId:uuid,orderId:uuid,purchaseId:uuid.optional(),
 kind:z.enum(['sale','purchase']),currency:z.string().regex(/^[A-Z]{3}$/),
 amountMinor:z.string().regex(/^[1-9]\d{0,17}$/),businessDate:z.iso.date(),
 reference:z.string().max(200),version:z.number().int().positive(),occurredAt:z.iso.datetime(),
 reversalOf:uuid.optional(),
}).strict().superRefine((event,ctx)=>{if(event.type==='payment.voided'&&!event.reversalOf)ctx.addIssue({code:'custom',path:['reversalOf'],message:'A reversal must reference its original event'});});
export type FinanceEvent=z.infer<typeof financeEvent>;
export interface FinanceAdapter {
 readonly systemCode:string;
 lookup(companyId:string,eventId:string):Promise<{status:'missing'|'accepted'|'posted'|'rejected';externalId?:string}>;
 send(event:FinanceEvent,idempotencyKey:string):Promise<{status:'accepted'|'posted';externalId:string}>;
}
export const aiRequest=z.object({schemaVersion:z.literal(1),companyId:uuid,actorId:uuid,
 task:z.enum(['extract_document','summarize_order','draft_followup']),
 requestId:uuid,context:z.array(z.object({sourceId:uuid,sourceVersion:z.number().int().positive(),text:z.string().max(20000)}).strict()).max(20),
}).strict();
export type AiRequest=z.infer<typeof aiRequest>;
export interface AiAdapter{run(input:AiRequest):Promise<{text:string;sourceIds:string[];model:string;usage:{inputTokens:number;outputTokens:number}}>}
// The core does not hand an adapter DB credentials or raw database queries.
export function requireIntegrationEnabled(enabled=false){if(!enabled)throw new Error('INTEGRATION_DISABLED');}
