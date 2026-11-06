begin;
create table if not exists trade_business.diligence_audits (
 company_id uuid not null, id uuid not null, lead_id uuid not null,
 draft jsonb not null, evidence jsonb not null default '[]', reviews jsonb not null default '[]',
 fusion jsonb, status text not null default 'needs_human' check(status in ('auto_accepted','needs_human','rejected_by_policy')),
 human_decision text check(human_decision in ('accept','reject')), human_actor_id uuid,
 report_id uuid, created_at timestamptz not null default now(),
 primary key(company_id,id),
 foreign key(company_id,lead_id) references trade_business.leads(company_id,id),
 foreign key(company_id,report_id) references trade_business.diligence_reports(company_id,id),
 check((human_decision is null)=(human_actor_id is null))
);
create index if not exists diligence_audits_recent on trade_business.diligence_audits(company_id,created_at desc,id);
alter table trade_business.diligence_audits enable row level security;
drop policy if exists diligence_audits_backend on trade_business.diligence_audits;
create policy diligence_audits_backend on trade_business.diligence_audits to business_backend using(true) with check(true);
revoke all on trade_business.diligence_audits from public;
do $$ declare r text; begin
 for r in select rolname from pg_roles where rolname in ('anon','authenticated') loop
 execute format('revoke all on trade_business.diligence_audits from %I',r);
 end loop;
end $$;
grant select,insert,update on trade_business.diligence_audits to business_backend;
commit;
