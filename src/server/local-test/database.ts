import {PGlite} from '@electric-sql/pglite';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {localTestEnabled,localCompanyId,localActors} from './guard';
import {upgradeLocalAgentRoles} from './agent-roles-migration';
import {localSql} from './sql';
const migrations=['complete-business-foundation.sql','shared-master-data.sql','shared-sales-orders.sql','shared-procurement.sql','shared-shipments.sql','shared-payments.sql','private-business-files.sql','shared-documents.sql','controlled-signatures.sql','refund-preparation.sql','product-origin-certificates.sql','employee-handover.sql','upload-lifecycle.sql','finance-expenses-costs.sql','customer-classification-codes.sql','20261027095948_ai_application_settings.sql','20261027110258_ai_model_profiles.sql','20261104000000_agent_foundation.sql','20261104010000_prospecting.sql','20261104011000_human_approval.sql','20261104012000_outreach_writeback.sql','20261104013000_agent_orchestration.sql','20261105090000_agent_plans.sql','20261105100000_agent_roles.sql','20261105120000_agent_step_deps.sql','20261105130000_diligence_audits.sql','20261105140000_outreach_audits.sql','20261105160000_followup_redraft.sql','20261105160000_outreach_send.sql','20261105170000_leads_maps.sql'];
type Databases={identity:ReturnType<typeof localSql>;business:ReturnType<typeof localSql>};
const state=globalThis as typeof globalThis&{reselatLocalDatabases?:Promise<Databases>};
async function open(){
 if(!localTestEnabled())throw new Error('LOCAL_TEST_DISABLED');const root=resolve('.local-test-data');await mkdir(root,{recursive:true,mode:0o700});
 const identity=new PGlite(resolve(root,'identity')),business=new PGlite(resolve(root,'business'));await Promise.all([identity.waitReady,business.waitReady]);
 const exists=await business.query<{name:string|null}>("select to_regclass('trade_business.business_records')::text as name");
 if(!exists.rows[0].name){await business.exec(await readFile('scripts/sql/business-initial-schema.sql','utf8'));for(const file of migrations)await business.exec(await readFile('scripts/sql/'+file,'utf8'));await business.query('insert into trade_business.company_profiles(id,legal_profile) values($1,$2)',[localCompanyId,JSON.stringify({name:'RESELAT（本机测试）',country:'中国',address:'本机虚构测试地址',email:'local@example.test',phone:'',bankName:'测试银行',bankAccount:'TEST-ONLY',swift:'TEST'})]);}
 await upgradeLocalAgentRoles(business);
 await business.exec(await readFile('scripts/sql/20261105120000_agent_step_deps.sql','utf8'));
 await business.exec(await readFile('scripts/sql/20261105130000_diligence_audits.sql','utf8'));
 await business.exec(await readFile('scripts/sql/20261105140000_outreach_audits.sql','utf8'));
 await business.exec(await readFile('scripts/sql/20261105160000_followup_redraft.sql','utf8'));
 const sendMigration=await business.query<{exists:boolean}>("select exists(select 1 from information_schema.columns where table_schema='trade_business' and table_name='outreach_drafts' and column_name='brevo_send_started_at') as exists");
 if(!sendMigration.rows[0].exists)await business.exec(await readFile('scripts/sql/20261105160000_outreach_send.sql','utf8'));
 const mapsMigration=await business.query<{exists:boolean}>("select exists(select 1 from information_schema.columns where table_schema='trade_business' and table_name='leads' and column_name='place_id') as exists");
 if(!mapsMigration.rows[0].exists)await business.exec(await readFile('scripts/sql/20261105170000_leads_maps.sql','utf8'));
 await business.exec(await readFile('scripts/sql/assistant-workspace.sql','utf8'));
 await business.exec('set role business_backend');
 await identity.exec(`create schema if not exists trade_private;
 create table if not exists trade_private.companies(id uuid primary key);
 create table if not exists trade_private.employees(user_id uuid primary key,company_id uuid not null references trade_private.companies(id),display_name text not null,role text not null,enabled boolean not null default true,version integer not null default 1,archived_at timestamptz,created_at timestamptz not null default now());
 create table if not exists trade_private.audit_events(id bigint generated always as identity primary key,company_id uuid not null,actor_id uuid not null,subject_id uuid not null,action text not null,details jsonb not null default '{}',created_at timestamptz not null default now());`);
 await identity.query('insert into trade_private.companies(id) values($1) on conflict do nothing',[localCompanyId]);
 for(const [role,id] of Object.entries(localActors))await identity.query('insert into trade_private.employees(user_id,company_id,display_name,role) values($1,$2,$3,$4) on conflict do nothing',[id,localCompanyId,({admin:'本机测试管理员',sales:'本机测试业务员',operations:'本机测试运营'} as Record<string,string>)[role],role]);
 return {identity:localSql(identity),business:localSql(business)};
}
export async function localDatabase(purpose:'identity'|'business'){if(!localTestEnabled())throw new Error('LOCAL_TEST_DISABLED');state.reselatLocalDatabases??=open();return (await state.reselatLocalDatabases)[purpose];}
