import {z} from 'zod';
import {businessDatabase} from '@/server/db/client';
import {runBusinessCommand,audit} from '@/server/business/commands';
import {checkAdmin,IdentityError} from '@/server/auth/employee';
import type {BusinessActor} from '@/server/business/access';
import {calendarSchema,knowledgeSchema,publishKnowledge,canSeeConversation,recordMessage,type Knowledge,type Conversation} from '@/modules/assistant/model';
export const assistantCommand=z.object({requestId:z.uuid(),action:z.enum(['save','publish','revoke','conversation','message','takeover','resume','calendar']),id:z.uuid(),version:z.number().int().nonnegative(),confirmed:z.boolean().optional(),calendar:calendarSchema.optional(),document:knowledgeSchema.optional(),customer:z.string().trim().min(1).max(200).optional(),text:z.string().trim().min(1).max(3000).optional(),messageId:z.uuid().optional()}).strict();
export async function assistantList(actor:BusinessActor){
 const db=await businessDatabase();
 const rows=await db`select id,kind,owner_id as "ownerId",data,version from trade_business.assistant_resources where company_id=${actor.companyId} order by created_at desc limit 500`;
 const documents:Knowledge[]=[],conversations:Conversation[]=[];
 for(const row of rows){if(row.kind==='knowledge'){const doc=knowledgeSchema.parse({...row.data,version:row.version});if(actor.role==='admin'||doc.state==='published')documents.push(doc);}else if(canSeeConversation(actor.role,actor.id,row.ownerId))conversations.push({...row.data,version:row.version} as Conversation);}
 const calendars=await db`select data,version from trade_business.assistant_calendars where company_id=${actor.companyId}`;
 return {documents,conversations,calendar:calendars[0]?.data??null,calendarVersion:calendars[0]?.version??0,channel:{wechat:'not_connected',email:'not_connected',model:'disabled',budget:0}};
}
export async function assistantMutate(actor:BusinessActor,input:z.infer<typeof assistantCommand>){
 if(['save','publish','revoke','calendar'].includes(input.action))checkAdmin(actor,actor.aal);
 return runBusinessCommand(actor,{requestId:input.requestId,kind:'assistant.'+input.action,payload:input},async tx=>{
 if(input.action==='calendar'){
  checkAdmin(actor,actor.aal);const calendar=calendarSchema.parse(input.calendar),old=await tx`select version from trade_business.assistant_calendars where company_id=${actor.companyId} for update`;
  if((old[0]?.version??0)!==input.version)throw new Error('VERSION_CONFLICT');
  await tx`insert into trade_business.assistant_calendars(company_id,data,version) values(${actor.companyId},${tx.json(calendar)},${input.version+1}) on conflict(company_id) do update set data=excluded.data,version=excluded.version`;
  await audit(tx,actor,actor.companyId,'assistant.calendar');return {id:actor.companyId,version:input.version+1};
 }
 const rows=await tx`select kind,owner_id as "ownerId",data,version from trade_business.assistant_resources where company_id=${actor.companyId} and id=${input.id} for update`;
 const old=rows[0];if((old?.version??0)!==input.version)throw new Error('VERSION_CONFLICT');
 let data:Knowledge|Conversation;let kind:'knowledge'|'conversation';const ownerId=old?.ownerId??actor.id;
 if(['save','publish','revoke'].includes(input.action)){
  checkAdmin(actor,actor.aal);kind='knowledge';if(old&&old.kind!==kind)throw new Error('NOT_FOUND');
  if(input.action==='save'){
   if(old&&old.data.state!=='draft')throw new Error('INVALID_TRANSITION');
   data=knowledgeSchema.parse(input.document);if(data.id!==input.id)throw new Error('INVALID_INPUT');data={...data,state:'draft',version:input.version+1,fileState:old?.data.fileState,fileHash:old?.data.fileHash};
   if(data.fileId&&data.fileId!==old?.data.fileId)throw new Error('INVALID_INPUT');
  }else{
   if(!old)throw new Error('NOT_FOUND');const doc=knowledgeSchema.parse(old.data);
   data=input.action==='publish'?publishKnowledge(doc,actor.role,input.confirmed===true):{...doc,state:'revoked'};
   data.version=input.version+1;
  }
 }else{
  kind='conversation';if(old&&(old.kind!==kind||!canSeeConversation(actor.role,actor.id,old.ownerId)))throw new IdentityError('FORBIDDEN');
  if(input.action==='conversation'){
   if(old||!input.customer)throw new Error('INVALID_INPUT');data={id:input.id,customer:input.customer,ownerId:actor.id,mode:'human',manualHold:false,version:1,messages:[]};
  }else{
   if(!old)throw new Error('NOT_FOUND');const conversation=old.data as Conversation;
   if(input.action==='message'){
    if(!input.text||!input.messageId)throw new Error('INVALID_INPUT');
    const docs=await tx`select data,version from trade_business.assistant_resources where company_id=${actor.companyId} and kind='knowledge' and data->>'state'='published'`;
    const calendars=await tx`select data from trade_business.assistant_calendars where company_id=${actor.companyId}`;
    data=recordMessage(conversation,input.messageId,input.text,docs.map(d=>knowledgeSchema.parse({...d.data,version:d.version})),calendars[0]?.data);
   }else data={...conversation,mode:input.action==='takeover'?'human':'bot',manualHold:input.action==='takeover'};
   data={...data,version:input.version+1};
  }
 }
 if(old)await tx`update trade_business.assistant_resources set data=${tx.json(data)},version=${input.version+1},updated_at=now() where company_id=${actor.companyId} and id=${input.id}`;
 else await tx`insert into trade_business.assistant_resources(company_id,id,kind,owner_id,data) values(${actor.companyId},${input.id},${kind},${ownerId},${tx.json(data)})`;
 await audit(tx,actor,input.id,'assistant.'+input.action,{version:input.version+1});return {id:input.id,version:input.version+1};
 });
}
