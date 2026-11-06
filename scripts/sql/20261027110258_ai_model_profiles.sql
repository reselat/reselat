begin;
create table trade_business.ai_model_profiles(
 company_id uuid not null references trade_business.company_profiles(id),id uuid not null,version integer not null check(version>0),
 label text not null check(length(label) between 1 and 60),provider text not null check(provider in ('deepseek','openai','qwen-cn','qwen-intl')),
 model text not null check(length(model) between 1 and 100),enabled boolean not null default false,archived boolean not null default false,
 input_price_micros numeric(15,0) not null check(input_price_micros>0),output_price_micros numeric(15,0) not null check(output_price_micros>0),
 prices_verified_at date not null,encrypted_key text check(encrypted_key is null or (encrypted_key like 'v1.%' and length(encrypted_key)<6000)),
 created_at timestamptz not null default now(),primary key(company_id,id),check(not archived or (not enabled and encrypted_key is null))
);
alter table trade_business.ai_model_profiles enable row level security;
create policy ai_profiles_backend on trade_business.ai_model_profiles to business_backend using(true) with check(true);
revoke all on trade_business.ai_model_profiles from public;
do $$ declare role_name text; begin
 for role_name in select rolname from pg_roles where rolname in ('anon','authenticated') loop execute format('revoke all on trade_business.ai_model_profiles from %I',role_name); end loop;
end $$;
grant select,insert on trade_business.ai_model_profiles to business_backend;
grant update(version,label,provider,model,enabled,archived,input_price_micros,output_price_micros,prices_verified_at,encrypted_key) on trade_business.ai_model_profiles to business_backend;
alter table trade_business.risk_ai_runs alter column order_id drop not null;
alter table trade_business.risk_ai_runs drop constraint risk_ai_runs_task_check;
alter table trade_business.risk_ai_runs add constraint risk_ai_runs_task_check check(task in ('order_risk','refund_precheck','connection_test'));
alter table trade_business.risk_ai_runs add constraint risk_ai_task_order_scope check((task='connection_test' and order_id is null) or (task<>'connection_test' and order_id is not null));
alter table trade_business.risk_ai_runs add column model_profile_id uuid;
alter table trade_business.risk_ai_runs add foreign key(company_id,model_profile_id) references trade_business.ai_model_profiles(company_id,id);
commit;
