import {z} from 'zod';
import {currency,date,uuid,version,positiveDecimal} from '@/modules/business/schemas';
import {expenseCategory} from './costs';
export const expenseInput=z.object({requestId:uuid,kind:z.enum(['request','reimbursement']),orderId:uuid.nullable(),applicationId:uuid.nullable(),category:expenseCategory,currency,amount:positiveDecimal,date,purpose:z.string().trim().min(1).max(1000),invoiceReference:z.string().trim().max(200)}).strict();
export const expenseAction=z.object({requestId:uuid,id:uuid,expectedVersion:version,action:z.enum(['submit','approve','reject','cancel','pay','void']),reason:z.string().trim().max(1000).default(''),paymentReference:z.string().trim().max(200).default(''),paymentDate:date.optional()}).strict();
export const expenseRow=z.object({id:uuid,no:z.string(),kind:z.enum(['request','reimbursement']),applicantId:uuid,orderId:uuid.nullable(),applicationId:uuid.nullable(),category:expenseCategory,currency,amountMinor:z.string(),day:z.string(),purpose:z.string(),invoiceReference:z.string(),state:z.enum(['draft','submitted','approved','rejected','paid','cancelled','void']),version:z.number().int(),reviewReason:z.string(),paymentReference:z.string(),paymentDay:z.string().nullable()});
export const expenseList=z.object({items:z.array(expenseRow),hasMore:z.boolean()});
export type Expense=z.infer<typeof expenseRow>;
