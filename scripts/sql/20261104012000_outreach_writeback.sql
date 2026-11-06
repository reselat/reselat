begin;
alter table trade_business.business_records add unique(company_id,id);
alter table trade_business.outreach_drafts add column customer_id uuid,add column written_back_at timestamptz,
 add foreign key(company_id,customer_id) references trade_business.business_records(company_id,id),
 add check ((customer_id is null)=(written_back_at is null));
alter table trade_business.approval_queue add column customer_id uuid,add column written_back_at timestamptz,
 add foreign key(company_id,customer_id) references trade_business.business_records(company_id,id),
 add check ((customer_id is null)=(written_back_at is null));
alter table trade_business.leads add column customer_id uuid,add column written_back_at timestamptz,
 add foreign key(company_id,customer_id) references trade_business.business_records(company_id,id),
 add check ((customer_id is null)=(written_back_at is null));
commit;
