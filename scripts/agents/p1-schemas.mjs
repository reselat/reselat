import {z} from 'zod';
const text=z.string().trim().min(1).max(20000);
export const payloads={
 outreach_writeback:z.object({approvalId:z.uuid()}).strict(),
 leads_upsert:z.object({name:text,email:z.email().transform(s=>s.toLowerCase()),source:z.enum(['manual','json','maps']).default('manual'),placeId:text.optional(),mapsUrl:z.url().refine(v=>/^https?:/.test(v)).optional(),notes:text.optional(),address:text.optional(),phone:text.optional()}).strict(),
 diligence_save_report:z.object({leadId:z.uuid(),summary:text}).strict(),
 outreach_draft_email:z.object({leadId:z.uuid(),subject:text,body:text}).strict(),
 outreach_submit_approval:z.object({draftId:z.uuid()}).strict()
};
export const commandSchema=kind=>z.object({requestId:z.uuid(),payload:payloads[kind]}).strict();
