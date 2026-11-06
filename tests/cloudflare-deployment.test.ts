import {readFileSync} from 'node:fs';
import {afterEach,describe,it,expect} from 'vitest';
import {loginBucket} from '../src/server/auth/login-limit';
import {cloudflareDatabase,hyperdriveTarget} from '../src/server/db/cloudflare';
const ref='a'.repeat(20),ref2='b'.repeat(20);
const contextSymbol=Symbol.for('__cloudflare-context__');
afterEach(()=>{delete (globalThis as Record<symbol,unknown>)[contextSymbol];});
describe('Cloudflare deployment',()=>{
 it('configures Worker assets and compatibility without secrets',()=>{const s=readFileSync('wrangler.jsonc','utf8');for(const value of ['nodejs_compat','cloudflare/worker.ts','ASSETS','WORKER_SELF_REFERENCE','"DEPLOYMENT_TARGET": "cloudflare"'])expect(s).toContain(value);expect(s).not.toMatch(/xkeysib-|sk-[A-Za-z0-9]{10}|postgres(ql)?:\/\/[^<\s"]+:[^<\s"]+@|service_role|eyJ[A-Za-z0-9_-]{10}/);});
 it('keeps local secrets ignored and scripts available; Vercel path kept',()=>{const ignore=readFileSync('.gitignore','utf8');for(const value of ['.dev.vars','.open-next/','.wrangler/','.env.local'])expect(ignore).toContain(value);const pkg=JSON.parse(readFileSync('package.json','utf8'));for(const script of ['cf:build','cf:preview','cf:deploy','cf:typegen','build','test:local'])expect(pkg.scripts[script]).toBeTruthy();expect(pkg.scripts['cf:preview']).not.toContain('3120');expect(pkg.scripts.build).toContain('next build');expect(pkg.scripts['test:local']).toBe('node scripts/start-local-test.mjs');expect(readFileSync('vercel.json','utf8')).toContain('nextjs');});
 it('.dev.vars.example only lists names',()=>{for(const line of readFileSync('.dev.vars.example','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))){const [,value]=line.split('=');expect(['','cloudflare']).toContain(value??'');}});
 it('uses the trusted Cloudflare address',()=>{const env:NodeJS.ProcessEnv={NODE_ENV:'production',DEPLOYMENT_TARGET:'cloudflare',LOGIN_RATE_LIMIT_SECRET:'x'.repeat(32)};expect(loginBucket(new Request('https://example.test',{headers:{'cf-connecting-ip':'192.0.2.1'}}),'a',env)).toHaveLength(64);expect(()=>loginBucket(new Request('https://example.test',{headers:{'x-forwarded-for':'192.0.2.1'}}),'a',env)).toThrow();});
 it('requires a Hyperdrive binding per database and distinct project refs',()=>{
  const env={HYPERDRIVE_IDENTITY:{connectionString:'postgres://u:p@hyperdrive.local:5432/postgres'},HYPERDRIVE_BUSINESS:{connectionString:'postgres://u:p@hyperdrive.local:5432/postgres'}};
  expect(hyperdriveTarget('identity',env,{IDENTITY_PROJECT_REF:ref,BUSINESS_PROJECT_REF:ref2}).projectRef).toBe(ref);
  expect(hyperdriveTarget('business',env,{IDENTITY_PROJECT_REF:ref,BUSINESS_PROJECT_REF:ref2}).projectRef).toBe(ref2);
  expect(()=>hyperdriveTarget('identity',{},{IDENTITY_PROJECT_REF:ref,BUSINESS_PROJECT_REF:ref2})).toThrow();
  expect(()=>hyperdriveTarget('business',env,{IDENTITY_PROJECT_REF:ref,BUSINESS_PROJECT_REF:ref})).toThrow();
  expect(()=>hyperdriveTarget('business',env,{IDENTITY_PROJECT_REF:ref,BUSINESS_PROJECT_REF:'bad'})).toThrow();
 });
 it('fails closed outside a Cloudflare request context',()=>{expect(()=>cloudflareDatabase('identity')).toThrow();});
 it('fails closed without Hyperdrive inside a request context',async()=>{(globalThis as Record<symbol,unknown>)[contextSymbol]={env:{},ctx:{}};await expect(cloudflareDatabase('business')).rejects.toThrow();});
 it('rejects filesystem storage on Cloudflare',async()=>{const saved={...process.env};try{process.env.FILE_STORAGE_DRIVER='filesystem';process.env.DEPLOYMENT_TARGET='cloudflare';const {getBusinessStorage}=await import('../src/server/files/storage');await expect(getBusinessStorage()).rejects.toThrow('STORAGE_NOT_CONFIGURED');}finally{process.env={...saved};}});
});
describe('Cloudflare build guard',()=>{
 it('blocks env files that OpenNext would embed',async()=>{const {blockedEnvFiles}=await import('../scripts/cf-build-guard.mjs');expect(blockedEnvFiles(['.env.local','.env','.env.production','.env.example','.dev.vars.example','package.json'])).toEqual(['.env.local','.env','.env.production']);});
 it('cf:build runs the guard first',()=>{const pkg=JSON.parse(readFileSync('package.json','utf8'));expect(pkg.scripts['cf:build'].startsWith('node scripts/cf-build-guard.mjs && ')).toBe(true);for(const s of ['cf:preview','cf:deploy','cf:upload'])expect(pkg.scripts[s]).toContain('npm run cf:build');});
});
