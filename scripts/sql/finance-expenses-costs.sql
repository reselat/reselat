begin;
create table trade_business.expense_claims(
 company_id uuid not null,id uuid not null,no text not null,kind text not null check(kind in ('request','reimbursement')),
 applicant_id uuid not null,order_id uuid,application_id uuid,category text not null check(category in ('production','logistics','customs','insurance','bank','commission','other')),
 currency text not null check(currency in ('USD','CNY','EUR','GBP','HKD','JPY')),amount_minor numeric(38,0) not null check(amount_minor>0),
 day date not null,purpose text not null check(length(purpose) between 1 and 1000),invoice_reference text not null default '',
 state text not null default 'draft' check(state in ('draft','submitted','approved','rejected','paid','cancelled','void')),
 version integer not null default 1 check(version>0),review_reason text not null default '',payment_reference text not null default '',payment_day date,created_at timestamptz not null default now(),
 primary key(company_id,id),unique(company_id,no),foreign key(company_id,order_id) references trade_business.orders(company_id,id),
 foreign key(company_id,application_id) references trade_business.expense_claims(company_id,id),check(kind='reimbursement' or application_id is null),
 check(state<>'paid' or (kind='reimbursement' and length(payment_reference)>0 and payment_day is not null))
);
create index expense_claims_applicant on trade_business.expense_claims(company_id,applicant_id,created_at desc,id);
create index expense_claims_order on trade_business.expense_claims(company_id,order_id,state);
create index expense_claims_application on trade_business.expense_claims(company_id,application_id,state);
create unique index expense_paid_reference on trade_business.expense_claims(company_id,payment_reference) where state='paid';
create unique index expense_active_invoice on trade_business.expense_claims(company_id,invoice_reference) where kind='reimbursement' and state in ('submitted','approved','paid') and invoice_reference<>'';
create table trade_business.order_cost_plans(
 company_id uuid not null,order_id uuid not null,version integer not null check(version>0),snapshot jsonb not null,
 reason text not null check(length(reason) between 1 and 1000),created_by uuid not null,created_at timestamptz not null default now(),
 primary key(company_id,order_id,version),foreign key(company_id,order_id) references trade_business.orders(company_id,id)
);
create table trade_business.risk_reads(company_id uuid not null,user_id uuid not null,risk_key text not null check(risk_key ~ '^[a-f0-9]{64}$'),read_at timestamptz not null default now(),primary key(company_id,user_id,risk_key),foreign key(company_id) references trade_business.company_profiles(id));
create table trade_business.risk_ai_runs(
 company_id uuid not null,id uuid not null,order_id uuid not null,actor_id uuid not null,day date not null,
 task text not null default 'order_risk' check(task in ('order_risk','refund_precheck')),subject_id uuid not null,fingerprint text not null,model text not null,reserved_usd_micros numeric(38,0) not null check(reserved_usd_micros>0),
 state text not null default 'reserved' check(state in ('reserved','running','succeeded','failed','unknown')),
 result jsonb,receipt jsonb,error_code text,resolution_note text,created_at timestamptz not null default now(),
 primary key(company_id,id),foreign key(company_id,order_id) references trade_business.orders(company_id,id)
);
create index risk_ai_daily on trade_business.risk_ai_runs(company_id,day,actor_id);
grant select,insert on trade_business.expense_claims,trade_business.order_cost_plans,trade_business.risk_reads to business_backend;
grant select,insert on trade_business.risk_ai_runs to business_backend;
grant update(state,result,receipt,error_code,resolution_note) on trade_business.risk_ai_runs to business_backend;
revoke all on trade_business.expense_claims,trade_business.order_cost_plans,trade_business.risk_reads,trade_business.risk_ai_runs from public;
grant update(state,version,review_reason,payment_reference,payment_day) on trade_business.expense_claims to business_backend;
-- Append-only cost snapshots and approvals; no DELETE grant for finance records.
commit;
