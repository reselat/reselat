begin;
alter table trade_business.outreach_drafts add column sent_at timestamptz, add column brevo_message_id text, add column brevo_send_started_at timestamptz;
commit;
