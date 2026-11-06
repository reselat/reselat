begin;
create table trade_business.business_commands(company_id uuid not null references trade_business.company_profiles(id),request_id uuid not null,actor_id uuid not null,kind text not null,payload_hash text not null check(length(payload_hash)=64),result jsonb not null check(jsonb_typeof(result)='object'),created_at timestamptz not null default now(),primary key(company_id,request_id));
create table trade_business.number_counters(company_id uuid not null references trade_business.company_profiles(id),kind text not null,value bigint not null check(value>0),primary key(company_id,kind));
grant select,insert on trade_business.business_commands to business_backend;
grant select,insert on trade_business.number_counters to business_backend;
grant update(value) on trade_business.number_counters to business_backend;
grant select on trade_business.audit_events to business_backend;
commit;
