begin;
-- Existing RLS/grants remain in force; no new table or client privileges.
alter table trade_business.agent_pipelines add column if not exists steps_graph jsonb not null default '[{"step_key":"prospect","seq":0,"role_code":"prospecting","action":"leads_upsert","depends_on":[]},{"step_key":"diligence","seq":1,"role_code":"diligence","action":"diligence_save_report","depends_on":["prospect"]},{"step_key":"outreach_draft","seq":2,"role_code":"outreach_draft","action":"outreach_draft_email","depends_on":["diligence"]},{"step_key":"outreach_submit","seq":3,"role_code":"outreach_draft","action":"outreach_submit_approval","depends_on":["outreach_draft"]}]'::jsonb;
alter table trade_business.agent_runs add column if not exists steps_graph jsonb not null default '[{"step_key":"prospect","seq":0,"role_code":"prospecting","action":"leads_upsert","depends_on":[]},{"step_key":"diligence","seq":1,"role_code":"diligence","action":"diligence_save_report","depends_on":["prospect"]},{"step_key":"outreach_draft","seq":2,"role_code":"outreach_draft","action":"outreach_draft_email","depends_on":["diligence"]},{"step_key":"outreach_submit","seq":3,"role_code":"outreach_draft","action":"outreach_submit_approval","depends_on":["outreach_draft"]}]'::jsonb;
alter table trade_business.agent_steps add column if not exists step_key text;
alter table trade_business.agent_steps add column if not exists role_code text;
update trade_business.agent_steps set step_key=case kind when 'leads_upsert' then 'prospect' when 'diligence_save_report' then 'diligence' when 'outreach_draft_email' then 'outreach_draft' when 'outreach_submit_approval' then 'outreach_submit' end,
 role_code=case kind when 'leads_upsert' then 'prospecting' when 'diligence_save_report' then 'diligence' else 'outreach_draft' end where step_key is null;
alter table trade_business.agent_steps alter column step_key set not null;
alter table trade_business.agent_steps alter column role_code set not null;
create unique index if not exists agent_steps_run_key on trade_business.agent_steps(company_id,run_id,step_key);
commit;
