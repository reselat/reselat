begin;
alter table trade_business.upload_intents add column closed_at timestamptz;
alter table trade_business.upload_intents add column last_activity_at timestamptz not null default now();
alter table trade_business.upload_intents add column cleanup_pending boolean not null default false;
alter table trade_business.upload_intents add column cleanup_error text;
-- Existing uploads receive a fresh inactivity grace period; historic activity is unknown.
update trade_business.upload_intents u set closed_at=now(),cleanup_pending=exists(select 1 from trade_business.upload_parts p where p.company_id=u.company_id and p.file_id=u.file_id) where exists(select 1 from trade_business.file_assets f where f.company_id=u.company_id and f.id=u.file_id and f.state='stored');
create index upload_intents_activity on trade_business.upload_intents(company_id,last_activity_at,file_id);
grant update(closed_at,last_activity_at,cleanup_pending,cleanup_error) on trade_business.upload_intents to business_backend;
grant delete on trade_business.upload_parts to business_backend;
commit;
