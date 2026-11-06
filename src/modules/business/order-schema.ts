import {z} from 'zod';
import {uuid,version,date,currency,positiveDecimal,decimal} from './schemas';
import {companySchema,partySchema,documentLineSchema} from '@/modules/workspace/model';
export const headerSchema=z.object({customerId:uuid,orderType:z.enum(['normal','sample']).default('normal'),currency,date,dueDate:date,deliveryDate:date,validUntil:date,incoterm:z.enum(['EXW','FCA','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP']),namedPlace:z.string().trim().min(1).max(200),paymentTerms:z.string().trim().min(1).max(300),buyerReference:z.string().max(120).default('')}).refine(v=>v.dueDate>=v.date&&v.deliveryDate>=v.date&&v.validUntil>=v.date,'INVALID_DATES');
export const orderDraftSchema=headerSchema.extend({requestId:uuid,id:uuid.optional(),expectedVersion:version.optional(),lines:z.array(z.object({productId:uuid,quantity:positiveDecimal,unitPrice:decimal}).strict()).min(1).max(50)}).strict().refine(v=>Boolean(v.id)===Boolean(v.expectedVersion),'VERSION_REQUIRED');
export const actionSchema=z.object({requestId:uuid,id:uuid,expectedVersion:version,action:z.enum(['submit','withdraw','confirm','cancel','complete','revise','assign','reopen']),reason:z.string().trim().min(1).max(500).optional(),operationsId:uuid.optional()}).strict();
export const frozenOrderSchema=z.object({id:uuid,no:z.string(),header:headerSchema,seller:companySchema,customer:partySchema,lines:z.array(documentLineSchema).min(1).max(50),totalMinor:z.string().regex(/^\d+$/)});
export type FrozenOrder=z.infer<typeof frozenOrderSchema>;
