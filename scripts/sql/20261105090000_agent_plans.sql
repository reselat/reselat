begin;
create table trade_business.agent_plans (
 company_id uuid not null, id uuid not null, pipeline_id uuid not null,
 version integer not null default 1 check(version>0), input jsonb not null, steps text not null check(length(steps)>0),
 state text not null default 'draft' check(state in ('draft','confirmed')),
 confirmed_by uuid, confirmed_at timestamptz, created_at timestamptz not null default now(),
 primary key(company_id,id),
 foreign key(company_id,pipeline_id) references trade_business.agent_pipelines(company_id,id),
 check((state='draft' and confirmed_by is null and confirmed_at is null) or
 (state='confirmed' and confirmed_by is not null and confirmed_at is not null))
);
alter table trade_business.agent_plans enable row level security;
create policy agent_plans_backend on trade_business.agent_plans to business_backend using(true) with check(true);
revoke all on trade_business.agent_plans from public;
grant select,insert,update on trade_business.agent_plans to business_backend;
alter table trade_business.agent_runs add column plan_id uuid,
 add foreign key(company_id,plan_id) references trade_business.agent_plans(company_id,id);
-- Legacy runs remain readable but cannot be claimed/advanced without a confirmed plan.
commit;
