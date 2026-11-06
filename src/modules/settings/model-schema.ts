import {z} from 'zod';
export const modelProvider=z.enum(['deepseek','openai','qwen-cn','qwen-intl']);
export type ModelProvider=z.infer<typeof modelProvider>;
export const providerLabels:Record<ModelProvider,string>={deepseek:'DeepSeek',openai:'OpenAI','qwen-cn':'通义千问 · 北京','qwen-intl':'通义千问 · 新加坡'};
export const profileFields=z.object({label:z.string().trim().min(1).max(60),provider:modelProvider,model:z.string().trim().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,99}$/),enabled:z.boolean(),inputPriceMicros:z.string().regex(/^[1-9]\d{0,14}$/),outputPriceMicros:z.string().regex(/^[1-9]\d{0,14}$/),pricesVerifiedAt:z.iso.date()}).strict();
export const modelProfileDTO=profileFields.extend({id:z.string().uuid(),version:z.number().int().positive(),keyConfigured:z.boolean(),lastTestState:z.string().nullable(),lastTestId:z.string().uuid().nullable().optional()});
export const modelProfilesDTO=z.object({items:z.array(modelProfileDTO)});
export type ModelProfile=z.infer<typeof modelProfileDTO>;
export const saveModelProfile=profileFields.extend({requestId:z.string().uuid(),id:z.string().uuid().optional(),expectedVersion:z.number().int().nonnegative(),apiKey:z.string().trim().min(10).max(4096).regex(/^[\x21-\x7e]+$/).optional()}).strict();
