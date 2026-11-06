import {AuthCreateRejected} from './auth-create-errors';
import type {CreateMember} from './member-domain';
export type ProvisionRecord={id:string;name:string;role:CreateMember['role'];state:'pending'|'auth_created'|'completed'|'needs_reconciliation'|'rejected';userId:string|null};
export type ProvisionStore={reserve:(input:Pick<CreateMember,'requestId'|'name'|'role'>)=>Promise<{fresh:boolean;record:ProvisionRecord}>;setUser:(id:string,userId:string)=>Promise<void>;finish:(id:string)=>Promise<void>;uncertain:(id:string)=>Promise<void>;reject:(id:string)=>Promise<void>};
export async function runProvision(store:ProvisionStore,create:(input:CreateMember)=>Promise<{userId:string}>,input:CreateMember){
 const {fresh,record}=await store.reserve({requestId:input.requestId,name:input.name,role:input.role});
 if(record.name!==input.name||record.role!==input.role)throw new Error('REQUEST_MISMATCH');
 if(!fresh)return {requestId:record.id,status:record.state,memberId:record.state==='completed'?record.userId:undefined};
 try{
  const {userId}=await create(input);
  await store.setUser(record.id,userId);
  await store.finish(record.id);
  return {requestId:record.id,status:'completed' as const,memberId:userId};
 }catch(error){
  if(error instanceof Error&&error.message==='CREATE_REJECTED'){await store.reject(record.id);return {requestId:record.id,status:'rejected' as const,errorCode:error instanceof AuthCreateRejected?error.safeCode:'AUTH_REQUEST_REJECTED'};}
  // A timeout or lost response must never become permission to create again.
  await store.uncertain(record.id);
  return {requestId:record.id,status:'needs_reconciliation' as const};
 }
}
