import {expect,it} from 'vitest';
import {mkdtemp,rm,symlink,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readDatabaseTarget} from '../src/server/db/config';
import {databaseSsl,identityServiceUrl,identityCookieName} from '../src/server/deployment/services';
import {localFileStorage} from '../src/server/files/local-storage';
const env={DEPLOYMENT_TARGET:'self-hosted',IDENTITY_PROJECT_REF:'localidentity00000000',BUSINESS_PROJECT_REF:'localbusiness00000000',IDENTITY_DATABASE_HOST:'identity-db',BUSINESS_DATABASE_HOST:'business-db',IDENTITY_DATABASE_URL:'postgresql://identity_backend:placeholder@identity-db:5432/postgres',BUSINESS_DATABASE_URL:'postgresql://business_backend:placeholder@business-db:5432/postgres',NEXT_PUBLIC_SUPABASE_URL:'https://trade.example.test',IDENTITY_SERVICE_URL:'http://kong:8000'};
it('keeps independent local database identity and rejects role or host confusion',()=>{
 expect(readDatabaseTarget('business',env).projectRef).toBe(env.BUSINESS_PROJECT_REF);
 expect(()=>readDatabaseTarget('business',{...env,BUSINESS_DATABASE_URL:env.IDENTITY_DATABASE_URL})).toThrow('NOT_CONFIGURED');
 expect(()=>readDatabaseTarget('business',{...env,BUSINESS_PROJECT_REF:env.IDENTITY_PROJECT_REF})).toThrow('NOT_CONFIGURED');
 expect(()=>readDatabaseTarget('business',{...env,DEPLOYMENT_TARGET:undefined})).toThrow('NOT_CONFIGURED');
 expect(()=>readDatabaseTarget('business',{...env,BUSINESS_DATABASE_URL:env.BUSINESS_DATABASE_URL+'?sslmode=disable'})).toThrow('NOT_CONFIGURED');
});
it('confines plaintext databases to the named private network and keeps cloud TLS verified',()=>{
 expect(databaseSsl('business',{...env,BUSINESS_DATABASE_TLS:'disable'},()=>true)).toBe(false);
 expect(()=>databaseSsl('business',{...env,BUSINESS_DATABASE_HOST:'db.public.example',BUSINESS_DATABASE_TLS:'disable'},()=>true)).toThrow();
 expect(()=>databaseSsl('business',{BUSINESS_DATABASE_TLS:'disable'},()=>true)).toThrow();
 expect(databaseSsl('business',{},()=>({verified:true}))).toEqual({verified:true});
});
it('uses internal identity transport while keeping the browser and server cookie namespace identical',()=>{
 expect(identityServiceUrl(env)).toBe('http://kong:8000');
 expect(identityCookieName(env)).toBe('sb-trade-auth-token');
 expect(()=>identityServiceUrl({...env,IDENTITY_SERVICE_URL:'http://user:password@kong:8000'})).toThrow();
 expect(()=>identityServiceUrl({...env,DEPLOYMENT_TARGET:undefined})).toThrow();
});
it('publishes private objects atomically without overwriting and rejects traversal or symlinks',async()=>{
 const root=await mkdtemp(join(tmpdir(),'siliantai-files-'));const outside=await mkdtemp(join(tmpdir(),'siliantai-outside-'));
 const company='00000000-0000-4000-8000-000000000001',file='00000000-0000-4000-8000-000000000002',path=company+'/'+file;
 try{const storage=await localFileStorage(root),bytes=new Uint8Array([1,2,3]);
  await storage.upload(path,bytes,'application/pdf');expect(await storage.download(path)).toEqual(bytes);
  await expect(storage.upload(path,new Uint8Array([9]),'application/pdf')).rejects.toThrow('STORAGE_ALREADY_EXISTS');expect(await storage.download(path)).toEqual(bytes);
  await storage.upload(path+'/parts/0',bytes,'application/octet-stream');expect(await storage.download(path+'/parts/0')).toEqual(bytes);
  await expect(storage.download('../secret')).rejects.toThrow();
  await mkdir(join(root,'11111111-1111-4111-8111-111111111111'));
  const linked='11111111-1111-4111-8111-111111111111/'+file;await mkdir(join(root,linked));await symlink(join(root,path,'object'),join(root,linked,'object'));await expect(storage.download(linked)).rejects.toThrow('STORAGE_UNKNOWN');
  await symlink(outside,join(root,'22222222-2222-4222-8222-222222222222'));await expect(storage.upload('22222222-2222-4222-8222-222222222222/'+file,bytes,'application/pdf')).rejects.toThrow();
 }finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});
it('removes only fixed temporary parts and preserves the archived local object',async()=>{const root=await mkdtemp(join(tmpdir(),'siliantai-parts-'));try{const company='00000000-0000-4000-8000-000000000001',file='00000000-0000-4000-8000-000000000002',path=company+'/'+file,storage=await localFileStorage(root),bytes=new Uint8Array([1]);await storage.upload(path,bytes,'application/pdf');await storage.upload(path+'/parts/0',bytes,'application/octet-stream');await storage.removeUploadParts(company,file);await storage.removeUploadParts(company,file);await expect(storage.download(path+'/parts/0')).rejects.toThrow('STORAGE_NOT_FOUND');expect(await storage.download(path)).toEqual(bytes);await expect(storage.removeUploadParts(company,'../object')).rejects.toThrow();}finally{await rm(root,{recursive:true,force:true});}});
