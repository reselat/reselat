begin;
create table trade_business.leads (
 company_id uuid not null references trade_business.company_profiles(id),id uuid not null,
 name text not null,email text not null check(email=lower(email)),source text not null check(source in ('manual','json')),
 created_at timestamptz not null default now(),primary key(company_id,id),unique(company_id,email)
);
create table trade_business.diligence_reports (
 company_id uuid not null,id uuid not null,lead_id uuid not null,summary text not null,
 created_at timestamptz not null default now(),primary key(company_id,id),
 foreign key(company_id,lead_id) references trade_business.leads(company_id,id)
);
create table trade_business.outreach_drafts (
 company_id uuid not null,id uuid not null,lead_id uuid not null,subject text not null,body text not null,
 state text not null default 'draft' check(state in ('draft','pending')),
 created_at timestamptz not null default now(),primary key(company_id,id),
 foreign key(company_id,lead_id) references trade_business.leads(company_id,id)
);
create table trade_business.approval_queue (
 company_id uuid not null,id uuid not null,draft_id uuid not null,submitted_by uuid not null,
 state text not null default 'pending' check(state='pending'),
 human_actor_id uuid check(human_actor_id is null),
 created_at timestamptz not null default now(),primary key(company_id,id),unique(company_id,draft_id),
 foreign key(company_id,draft_id) references trade_business.outreach_drafts(company_id,id)
);
alter table trade_business.leads enable row level security;
create policy leads_backend on trade_business.leads to business_backend using(true) with check(true);
revoke all on trade_business.leads from public;
do $$ declare r text; begin
 for r in select rolname from pg_roles where rolname in ('anon','authenticated') loop
 execute format('revoke all on trade_business.leads from %I',r);
 end loop;
end $$;
grant select,insert,update on trade_business.leads to business_backend;
alter table trade_business.diligence_reports enable row level security;
create policy diligence_reports_backend on trade_business.diligence_reports to business_backend using(true) with check(true);
revoke all on trade_business.diligence_reports from public;
do $$ declare r text; begin
 for r in select rolname from pg_roles where rolname in ('anon','authenticated') loop
 execute format('revoke all on trade_business.diligence_reports from %I',r);
 end loop;
end $$;
grant select,insert,update on trade_business.diligence_reports to business_backend;
alter table trade_business.outreach_drafts enable row level security;
create policy outreach_drafts_backend on trade_business.outreach_drafts to business_backend using(true) with check(true);
revoke all on trade_business.outreach_drafts from public;
do $$ declare r text; begin
 for r in select rolname from pg_roles where rolname in ('anon','authenticated') loop
 execute format('revoke all on trade_business.outreach_drafts from %I',r);
 end loop;
end $$;
grant select,insert,update on trade_business.outreach_drafts to business_backend;
alter table trade_business.approval_queue enable row level security;
create policy approval_queue_backend on trade_business.approval_queue to business_backend using(true) with check(true);
revoke all on trade_business.approval_queue from public;
do $$ declare r text; begin
 for r in select rolname from pg_roles where rolname in ('anon','authenticated') loop
 execute format('revoke all on trade_business.approval_queue from %I',r);
 end loop;
end $$;
grant select,insert,update on trade_business.approval_queue to business_backend;
commit;
