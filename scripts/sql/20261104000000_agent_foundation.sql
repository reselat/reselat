begin;
create table trade_business.agent_pipelines (
 company_id uuid not null references trade_business.company_profiles(id),
 id uuid not null, name text not null check(length(name) between 1 and 100),
 enabled boolean not null default false,
 created_at timestamptz not null default now(),
 primary key(company_id,id)
);
create table trade_business.agent_runs (
 company_id uuid not null, id uuid not null, pipeline_id uuid not null,
 state text not null default 'queued' check(state in ('queued','running','succeeded','failed')),
 created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz,
 primary key(company_id,id),
 foreign key(company_id,pipeline_id) references trade_business.agent_pipelines(company_id,id),
 check(finished_at is null or started_at is not null),
 check(started_at is null or started_at>=created_at),
 check(finished_at is null or finished_at>=started_at)
);
create index agent_runs_pipeline_state on trade_business.agent_runs(company_id,pipeline_id,state,created_at);
alter table trade_business.agent_pipelines enable row level security;
alter table trade_business.agent_runs enable row level security;
create policy agent_pipelines_backend on trade_business.agent_pipelines to business_backend using(true) with check(true);
create policy agent_runs_backend on trade_business.agent_runs to business_backend using(true) with check(true);
revoke all on trade_business.agent_pipelines,trade_business.agent_runs from public;
do $$ declare role_name text; begin
 for role_name in select rolname from pg_roles where rolname in ('anon','authenticated') loop
 execute format('revoke all on trade_business.agent_pipelines,trade_business.agent_runs from %I',role_name);
 end loop;
end $$;
grant select,insert,update on trade_business.agent_pipelines,trade_business.agent_runs to business_backend;
commit;
