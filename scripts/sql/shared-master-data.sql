begin;
alter table trade_business.business_records add column reviewed_by uuid;
alter table trade_business.business_records add column reviewed_at timestamptz;
grant update(owner_id,payload,version,reviewed_by,reviewed_at) on trade_business.business_records to business_backend;
grant insert,delete on trade_business.record_shares to business_backend;
create table trade_business.followups(id uuid not null,company_id uuid not null,customer_id uuid not null,customer_kind text not null default 'customer' check(customer_kind='customer'),actor_id uuid not null,day date not null,note text not null check(length(note) between 1 and 2000),next_day date,created_at timestamptz not null default now(),primary key(company_id,id),foreign key(company_id,customer_kind,customer_id) references trade_business.business_records(company_id,kind,id));
grant select,insert on trade_business.followups to business_backend;
commit;
