begin;
create table trade_business.agent_roles (
 company_id uuid not null references trade_business.company_profiles(id),
 id uuid not null, code text not null check(code in ('prospecting','diligence','outreach_draft')),
 display_name text not null check(length(display_name) between 1 and 100),
 system_prompt text not null check(length(system_prompt) between 1 and 10000),
 allowed_actions text[] not null, enabled boolean not null default true,
 version integer not null default 1 check(version>0),
 primary key(company_id,id), unique(company_id,code),
 check(array_position(allowed_actions,null) is null and allowed_actions <@ case code
 when 'prospecting' then array['leads_upsert']
 when 'diligence' then array['diligence_save_report']
 when 'outreach_draft' then array['outreach_draft_email','outreach_submit_approval'] end)
);
alter table trade_business.agent_roles enable row level security;
create policy agent_roles_backend on trade_business.agent_roles to business_backend using(true) with check(true);
revoke all on trade_business.agent_roles from public;
grant select,insert,update on trade_business.agent_roles to business_backend;
commit;
