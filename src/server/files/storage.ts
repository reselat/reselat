import {objectKey,partKeys} from './part-paths';
import {localFileStorage} from './local-storage';
import {createClient} from '@supabase/supabase-js';
export interface BusinessStorage{removeUploadParts(companyId:string,fileId:string):Promise<void>;removeAbandonedExportObject(companyId:string,fileId:string):Promise<void>;upload(path:string,bytes:Uint8Array,mime:string):Promise<void>;download(path:string):Promise<Uint8Array>;}
export const businessBucket='trade-private-files';
export async function getBusinessStorage():Promise<BusinessStorage>{
 if(process.env.FILE_STORAGE_DRIVER==='filesystem'){if(process.env.DEPLOYMENT_TARGET!=='self-hosted')throw new Error('STORAGE_NOT_CONFIGURED');return localFileStorage(process.env.PRIVATE_FILES_ROOT);}
 const ref=process.env.BUSINESS_PROJECT_REF,key=process.env.BUSINESS_STORAGE_ADMIN_KEY;
 if(!ref||!/^[a-z0-9]{20}$/.test(ref)||!key||key===process.env.SUPABASE_AUTH_ADMIN_KEY||ref===process.env.IDENTITY_PROJECT_REF)throw new Error('STORAGE_NOT_CONFIGURED');
 const client=createClient('https://'+ref+'.supabase.co',key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,redirect:'error'})}});
 const {data,error}=await client.storage.getBucket(businessBucket);if(error||!data||data.public)throw new Error('STORAGE_NOT_CONFIGURED');
 async function remove(paths:string[]){const {error}=await client.storage.from(businessBucket).remove(paths);if(error)throw new Error('STORAGE_UNKNOWN');for(const path of paths){const {error:readError}=await client.storage.from(businessBucket).download(path);if(!readError||String(readError.statusCode)!=='404')throw new Error('STORAGE_UNKNOWN');}}
 return {
  removeUploadParts:async(companyId,fileId)=>remove(partKeys(companyId,fileId)),
  removeAbandonedExportObject:async(companyId,fileId)=>remove([objectKey(companyId,fileId)]),
  async upload(path,bytes,mime){const {error}=await client.storage.from(businessBucket).upload(path,bytes,{contentType:mime,cacheControl:'0',upsert:false});if(error)throw new Error(String(error.statusCode)==='409'?'STORAGE_ALREADY_EXISTS':'STORAGE_UNKNOWN');},
  async download(path){const {data,error}=await client.storage.from(businessBucket).download(path);if(error||!data)throw new Error(String(error?.statusCode)==='404'?'STORAGE_NOT_FOUND':'STORAGE_UNKNOWN');return new Uint8Array(await data.arrayBuffer());},
 };
}
