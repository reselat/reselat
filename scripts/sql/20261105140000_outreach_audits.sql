begin;
alter table trade_business.approval_queue add column if not exists approval_gate text not null default 'human' check(approval_gate in ('human','auto'));
alter table trade_business.approval_queue drop constraint approval_queue_human_actor_id_check;
alter table trade_business.approval_queue add constraint approval_queue_human_actor_id_check check(
 (approval_gate='human' and ((state='pending' and human_actor_id is null) or (state in ('approved','rejected') and human_actor_id is not null)))
 or (approval_gate='auto' and state='approved' and human_actor_id is null)
);
create table if not exists trade_business.outreach_audits (
 company_id uuid not null, id uuid not null, lead_id uuid not null, report_id uuid not null,
 report_summary text not null, draft jsonb not null, reviews jsonb not null default '[]', fusion jsonb,
 status text not null default 'needs_human' check(status in ('needs_human','auto_approved')),
 draft_id uuid, approval_id uuid, created_at timestamptz not null default now(),
 primary key(company_id,id),
 foreign key(company_id,lead_id) references trade_business.leads(company_id,id),
 foreign key(company_id,report_id) references trade_business.diligence_reports(company_id,id),
 foreign key(company_id,draft_id) references trade_business.outreach_drafts(company_id,id),
 foreign key(company_id,approval_id) references trade_business.approval_queue(company_id,id),
 check((fusion is null)=(draft_id is null)), check((draft_id is null)=(approval_id is null))
);
create index if not exists outreach_audits_recent on trade_business.outreach_audits(company_id,created_at desc,id);
alter table trade_business.outreach_audits enable row level security;
drop policy if exists outreach_audits_backend on trade_business.outreach_audits;
create policy outreach_audits_backend on trade_business.outreach_audits to business_backend using(true) with check(true);
revoke all on trade_business.outreach_audits from public;
do $$ declare r text; begin
 for r in select rolname from pg_roles where rolname in ('anon','authenticated') loop
 execute format('revoke all on trade_business.outreach_audits from %I',r);
 end loop;
end $$;
grant select,insert,update on trade_business.outreach_audits to business_backend;
commit;
