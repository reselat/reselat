import {objectKey,partKeys} from './part-paths';
import {constants} from 'node:fs';
import {mkdir,open,realpath,link,unlink,lstat} from 'node:fs/promises';
import {isAbsolute,join,dirname} from 'node:path';
import type {BusinessStorage} from './storage';

export async function localFileStorage(root:string|undefined):Promise<BusinessStorage>{
 if(!root||!isAbsolute(root))throw new Error('STORAGE_NOT_CONFIGURED');
 await mkdir(root,{recursive:true,mode:0o700});const base=await realpath(root);
 const pathFor=(path:string)=>{if(!/^[a-f0-9-]{36}\/[a-f0-9-]{36}(\/parts\/[0-4])?$/.test(path))throw new Error('STORAGE_UNKNOWN');return join(base,path.split('/').length===2?path+'/object':path);};
 async function safeParent(path:string){const parent=dirname(path);await mkdir(parent,{recursive:true,mode:0o700});if(await realpath(parent)!==parent)throw new Error('STORAGE_UNKNOWN');}
 async function remove(path:string){const dest=pathFor(path);try{if(await realpath(dirname(dest))!==dirname(dest))throw new Error();const info=await lstat(dest);if(!info.isFile()||info.isSymbolicLink())throw new Error();await unlink(dest);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw new Error('STORAGE_UNKNOWN');}}
 return {
  async removeUploadParts(companyId,fileId){for(const path of partKeys(companyId,fileId))await remove(path);},
  async removeAbandonedExportObject(companyId,fileId){await remove(objectKey(companyId,fileId));},
  async upload(path,bytes){const dest=pathFor(path);await safeParent(dest);
   const temp=dest+'.'+crypto.randomUUID()+'.tmp';
   try{const file=await open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
    // Atomic create-only publication; never overwrite an archived object.
    await link(temp,dest);
   }catch(error){throw new Error((error as NodeJS.ErrnoException).code==='EEXIST'?'STORAGE_ALREADY_EXISTS':'STORAGE_UNKNOWN');}
   finally{await unlink(temp).catch(()=>{});}
  },
  async download(path){const dest=pathFor(path);try{if(await realpath(dirname(dest))!==dirname(dest))throw new Error();const file=await open(dest,constants.O_RDONLY|constants.O_NOFOLLOW);try{const info=await file.stat();if(!info.isFile()||info.size>52428800)throw new Error();return new Uint8Array(await file.readFile());}finally{await file.close();}}
   catch(error){throw new Error((error as NodeJS.ErrnoException).code==='ENOENT'?'STORAGE_NOT_FOUND':'STORAGE_UNKNOWN');}
  },
 };
}
