import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {classifyAuthCreateError} from './auth-create-errors';
import type {CreateMember} from './member-domain';
import {identityServiceUrl} from '@/server/deployment/services';
export function authAdmin(){const key=process.env.SUPABASE_AUTH_ADMIN_KEY;if(!key||key.startsWith('sb_publishable_'))throw new Error('AUTH_ADMIN_NOT_CONFIGURED');return createClient(identityServiceUrl(process.env),key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});}
export async function createAuthAccount(input:CreateMember){
 const {data,error}=await authAdmin().auth.admin.createUser({email:input.email,password:input.password,email_confirm:true,app_metadata:{trade_provision_id:input.requestId}});
 if(error)throw classifyAuthCreateError(error);if(!data.user)throw new Error('AUTH_RESULT_UNKNOWN');
 return {userId:data.user.id};
}
export async function confirmProvisionIdentity(userId:string,requestId:string){const {data,error}=await authAdmin().auth.admin.getUserById(userId);if(error||data.user?.app_metadata?.trade_provision_id!==requestId)throw new Error('RECONCILIATION_REQUIRED');}
