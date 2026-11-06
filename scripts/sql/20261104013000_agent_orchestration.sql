begin;
alter table trade_business.agent_runs drop constraint agent_runs_state_check;
alter table trade_business.agent_runs add check(state in ('queued','reserved','running','awaiting_approval','succeeded','failed','cancelled'));
alter table trade_business.agent_runs add column lease_owner uuid, add column lease_until timestamptz, add column input jsonb not null default '{}';
create table trade_business.agent_steps (
 company_id uuid not null, run_id uuid not null, seq integer not null check(seq>=0), kind text not null,
 state text not null check(state in ('succeeded','skipped')), evidence jsonb not null default '{}',
 created_at timestamptz not null default now(), primary key(company_id,run_id,seq),
 foreign key(company_id,run_id) references trade_business.agent_runs(company_id,id)
);
alter table trade_business.agent_steps enable row level security;
create policy agent_steps_backend on trade_business.agent_steps to business_backend using(true) with check(true);
revoke all on trade_business.agent_steps from public;
grant select,insert on trade_business.agent_steps to business_backend;
commit;
