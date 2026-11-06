import {z} from 'zod';
const text=z.string().trim().min(1).max(20000);
const short=z.string().trim().min(1).max(100);
const mapsSearch=z.object({
 country:short,industry:short,city:short.optional(),
 maxResults:z.number().int().min(1).max(60).default(20),
 language:z.string().trim().min(2).max(20).regex(/^[a-zA-Z]{2,3}(?:-[a-zA-Z]{2,4})?$/).optional(),
 enrich:z.boolean().default(false)
}).strict();
const mapsLead=z.object({
 name:text,email:z.email().transform(s=>s.toLowerCase()).optional(),source:z.literal('maps').optional(),
 placeId:text.optional(),place_id:text.optional(),
 mapsUrl:z.url().refine(v=>/^https?:/.test(v)).optional(),maps_url:z.url().refine(v=>/^https?:/.test(v)).optional(),
 notes:text.optional(),address:text.optional(),phone:text.optional()
}).strict();
export const payloads={
 outreach_writeback:z.object({approvalId:z.uuid()}).strict(),
 leads_upsert:z.object({name:text,email:z.email().transform(s=>s.toLowerCase()),source:z.enum(['manual','json','maps']).default('manual'),placeId:text.optional(),mapsUrl:z.url().refine(v=>/^https?:/.test(v)).optional(),notes:text.optional(),address:text.optional(),phone:text.optional()}).strict(),
 maps_search:mapsSearch,
 maps_import:z.union([mapsSearch,z.object({rows:z.array(mapsLead).min(1).max(100)}).strict()]),
 diligence_save_report:z.object({leadId:z.uuid(),summary:text}).strict(),
 outreach_draft_email:z.object({leadId:z.uuid(),subject:text,body:text}).strict(),
 outreach_submit_approval:z.object({draftId:z.uuid()}).strict()
};
export const commandSchema=kind=>z.object({requestId:z.uuid(),payload:payloads[kind]}).strict();
