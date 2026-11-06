begin;
alter table trade_business.leads drop constraint leads_source_check;
alter table trade_business.leads add constraint leads_source_check check(source in ('manual','json','maps'));
alter table trade_business.leads
 add column place_id text,
 add column maps_url text,
 add column notes text,
 add column address text,
 add column phone text;
commit;
