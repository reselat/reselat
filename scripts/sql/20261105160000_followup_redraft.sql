begin;
alter table trade_business.outreach_drafts add column if not exists followup_id uuid, add column if not exists parent_draft_id uuid, add column if not exists followup_round integer;
create unique index if not exists outreach_followup_once on trade_business.outreach_drafts(company_id,followup_id) where followup_id is not null;
commit;
