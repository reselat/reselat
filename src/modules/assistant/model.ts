import {z} from 'zod';
export const quoteSchema=z.object({product:z.string().trim().min(1).max(200),specification:z.string().trim().min(1).max(200),unitPrice:z.string().regex(/^\d{1,12}(\.\d{1,6})?$/),currency:z.string().regex(/^[A-Z]{3}$/),unit:z.string().trim().min(1).max(30),conditions:z.string().trim().max(1000),page:z.number().int().positive(),validUntil:z.string().refine(v=>!v||z.iso.date().safeParse(v).success).default('')});
export const knowledgeSchema=z.object({id:z.uuid(),title:z.string().trim().min(1).max(200),kind:z.enum(['faq','product','quote']),text:z.string().trim().max(20000),keywords:z.string().max(1000),source:z.string().trim().min(1).max(500),fileId:z.uuid().nullable(),fileState:z.enum(['uploading','stored']).optional(),fileHash:z.string().optional(),quotes:z.array(quoteSchema).max(100),state:z.enum(['draft','published','revoked']),version:z.number().int().positive()});
export type Knowledge=z.infer<typeof knowledgeSchema>;
export function publishKnowledge(raw:unknown,role:string,confirmed:boolean):Knowledge{
 if(role!=='admin'||!confirmed)throw new Error('REVIEW_REQUIRED');const doc=knowledgeSchema.parse(raw);
 if(doc.fileId&&doc.fileState!=='stored')throw new Error('FILE_NOT_READY');
 if(doc.state!=='draft'||(!doc.text&&!doc.quotes.length)||(doc.kind==='quote'&&(!doc.quotes.length||doc.quotes.some(q=>!q.conditions||!q.validUntil))))throw new Error('REVIEW_REQUIRED');
 return {...doc,state:'published'};
}
export function canSeeConversation(role:string,actorId:string,ownerId:string){return role==='admin'||actorId===ownerId;}
const normalize=(s:string)=>s.trim().toLowerCase().replace(/[?？。.!！]+$/g,'').trim();
export function replyToMessage(message:string,documents:Knowledge[],today=new Date().toISOString().slice(0,10)):{kind:'answer'|'handover';text:string;sourceIds:string[]}{
 const fallback={kind:'handover' as const,text:'此问题需要业务员核实，已记录到待办。',sourceIds:[]};
 if(/discount|total|bank|payment|delivery|contract|折扣|总额|议价|收款|银行|付款|交期|合同/i.test(message))return fallback;
 const query=normalize(message);if(!query)return fallback;
 const published=documents.filter(d=>d.state==='published');
 const quotes=published.flatMap(d=>d.quotes.filter(q=>normalize(q.product+' '+q.specification)===query&&q.conditions&&q.validUntil>=today).map(q=>({d,q})));
 if(quotes.length===1){const {d,q}=quotes[0];return {kind:'answer',text:`${q.product} / ${q.specification}: ${q.currency} ${q.unitPrice}/${q.unit}。${q.conditions}；有效至 ${q.validUntil}。来源：${d.title}，第 ${q.page} 页。`,sourceIds:[d.id]};}
 const found=published.filter(d=>d.kind!=='quote'&&d.text&&d.keywords.split(/[,，\n]/).some(k=>normalize(k)===query));
 return found.length===1?{kind:'answer',text:found[0].text,sourceIds:[found[0].id]}:fallback;
}
export type ReceptionMessage={id:string;text:string;reply:string;kind:'answer'|'handover';status:'draft'|'simulated';sources:{id:string;version:number}[];createdAt:string};
export type Conversation={id:string;customer:string;ownerId:string;mode:'human'|'bot'|'waiting_human';manualHold:boolean;version:number;messages:ReceptionMessage[]};
export const calendarSchema=z.object({timeZone:z.string().max(100).refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false;}}),start:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),end:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),workDays:z.array(z.number().int().min(1).max(7)).min(1).max(7),holidays:z.array(z.iso.date()).max(100).default([])}).refine(v=>v.start<v.end,{message:'Use a same-day business window'});
export type Calendar=z.infer<typeof calendarSchema>;
export function isOutsideBusinessHours(raw:unknown,now:Date):boolean{
 const parsed=calendarSchema.safeParse(raw);if(!parsed.success||Number.isNaN(now.getTime()))return false;
 const c=parsed.data,parts=new Intl.DateTimeFormat('en-CA',{timeZone:c.timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now),get=(name:string)=>parts.find(p=>p.type===name)!.value;
 const day=get('year')+'-'+get('month')+'-'+get('day'),weekday=new Date(day+'T12:00:00Z').getUTCDay()||7,time=get('hour')+':'+get('minute');
 return c.holidays.includes(day)||!c.workDays.includes(weekday)||time<c.start||time>=c.end;
}
export function recordMessage(conversation:Conversation,id:string,text:string,documents:Knowledge[],calendar?:unknown,now=new Date()):Conversation{
 if(conversation.messages.some(m=>m.id===id))return conversation;
 if(conversation.messages.length>=200)throw new Error('FILE_LIMIT');
 const c=calendarSchema.safeParse(calendar);const today=new Intl.DateTimeFormat('en-CA',{timeZone:c.success?c.data.timeZone:'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const reply=replyToMessage(text,documents,today),automatic=!conversation.manualHold&&conversation.mode!=='waiting_human'&&isOutsideBusinessHours(calendar,now);
 const message:ReceptionMessage={id,text,reply:reply.text,kind:reply.kind,status:automatic&&reply.kind==='answer'?'simulated':'draft',sources:reply.sourceIds.map(id=>({id,version:documents.find(d=>d.id===id)!.version})),createdAt:now.toISOString()};
 return {...conversation,mode:reply.kind==='handover'?'waiting_human':automatic?'bot':'human',messages:[...conversation.messages,message]};
}
