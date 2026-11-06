import {z} from 'zod';
export const aiPreferences=z.object({enabled:z.boolean(),model:z.enum(['deepseek-flash','deepseek-v4-pro']),dailyBudgetMicros:z.string().regex(/^(0|[1-9]\d{0,14})$/),dailyCalls:z.number().int().min(1).max(100),orderRiskEnabled:z.boolean(),refundPrecheckEnabled:z.boolean(),orderRiskModelId:z.string().uuid().nullable().optional(),refundPrecheckModelId:z.string().uuid().nullable().optional()}).strict();
export type AiPreferences=z.infer<typeof aiPreferences>;
export const defaultAiPreferences:AiPreferences={enabled:false,model:'deepseek-flash',dailyBudgetMicros:'0',dailyCalls:5,orderRiskEnabled:true,refundPrecheckEnabled:true};
export const aiSettingsDTO=z.object({version:z.number().int().nonnegative(),preferences:aiPreferences,environment:z.object({enabled:z.boolean(),keyConfigured:z.boolean(),ready:z.boolean(),blocker:z.string(),dailyBudgetMicros:z.string(),dailyCalls:z.number().int(),mode:z.enum(['legacy','multi']).optional(),storageReady:z.boolean().optional()})});
export const aiAvailabilityDTO=z.object({enabled:z.boolean(),reason:z.string()});
export function usdToMicros(value:string){if(!/^(0|[1-9]\d{0,8})(\.\d{1,6})?$/.test(value))throw new Error('请输入非负美元金额，最多6位小数。');const [whole,fraction='']=value.split('.');return (BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'))).toString();}
export function microsToUsd(value:string){const n=BigInt(value);return String(n/1000000n)+'.'+String(n%1000000n).padStart(6,'0');}
