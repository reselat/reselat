-- New independent business project only. No employee/role/Auth tables.
begin;
create role business_backend nologin nosuperuser nocreatedb nocreaterole nobypassrls;
create schema trade_business;
revoke all on schema trade_business from public;
create table trade_business.deployment_identity(
 singleton boolean primary key default true check(singleton),
 purpose text not null check(purpose='business'),
 project_ref text not null check(project_ref ~ '^[a-z0-9]{20}$')
);
create table trade_business.company_profiles(id uuid primary key,legal_profile jsonb not null default '{}' check(jsonb_typeof(legal_profile)='object'),created_at timestamptz not null default now());
create table trade_business.business_records(id uuid not null,company_id uuid not null references trade_business.company_profiles(id),kind text not null check(kind in ('customer','product','supplier')),owner_id uuid,version integer not null default 1 check(version>0),payload jsonb not null check(jsonb_typeof(payload)='object'),created_at timestamptz not null default now(),primary key(company_id,kind,id));
create table trade_business.record_shares(company_id uuid not null,kind text not null,record_id uuid not null,user_id uuid not null,primary key(company_id,kind,record_id,user_id),foreign key(company_id,kind,record_id) references trade_business.business_records(company_id,kind,id));
create table trade_business.audit_events(id bigint generated always as identity primary key,company_id uuid not null references trade_business.company_profiles(id),actor_id uuid not null,subject_id uuid not null,action text not null,details jsonb not null default '{}' check(jsonb_typeof(details)='object'),created_at timestamptz not null default now());
create table trade_business.integration_outbox(id uuid primary key,company_id uuid not null references trade_business.company_profiles(id),system_code text not null,external_id text,event_type text not null,idempotency_key text not null,status text not null default 'disabled' check(status in ('disabled','pending','sent','failed','needs_reconciliation')),created_at timestamptz not null default now(),unique(company_id,system_code,idempotency_key));
grant usage on schema trade_business to business_backend;
grant select on trade_business.deployment_identity,trade_business.company_profiles,trade_business.business_records,trade_business.record_shares to business_backend;
grant update(legal_profile) on trade_business.company_profiles to business_backend;
grant insert on trade_business.business_records to business_backend;
grant update(payload,version) on trade_business.business_records to business_backend;
grant insert on trade_business.audit_events to business_backend;
grant usage on sequence trade_business.audit_events_id_seq to business_backend;
-- No marker/company row is invented: append approved target ref and stable company UUID during cloud review.
commit;
