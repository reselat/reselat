begin;
create table trade_business.orders(
 company_id uuid not null references trade_business.company_profiles(id),id uuid not null,
 no text not null,customer_id uuid not null,customer_kind text not null default 'customer' check(customer_kind='customer'),
 owner_id uuid not null,created_by uuid not null,operations_id uuid,
 state text not null default 'draft' check(state in ('draft','submitted','confirmed','fulfilling','completed','cancelled')),
 version integer not null default 1 check(version>0),source_version integer not null default 1 check(source_version>0),
 currency text not null check(currency in ('USD','CNY','EUR','GBP','HKD','JPY')),
 day date not null,due_day date not null,payload jsonb not null,total_minor numeric(38,0) not null check(total_minor>=0),
 created_at timestamptz not null default now(),primary key(company_id,id),unique(company_id,no),
 foreign key(company_id,customer_kind,customer_id) references trade_business.business_records(company_id,kind,id),check(due_day>=day)
);
create index orders_scope on trade_business.orders(company_id,owner_id,state,created_at,id);
create index orders_operations on trade_business.orders(company_id,operations_id,state);
create table trade_business.order_versions(company_id uuid not null,order_id uuid not null,version integer not null,snapshot jsonb not null,created_by uuid not null,created_at timestamptz not null default now(),primary key(company_id,order_id,version),foreign key(company_id,order_id) references trade_business.orders(company_id,id));
create table trade_business.order_lines(company_id uuid not null,id uuid not null,order_id uuid not null,order_version integer not null,product_id uuid not null,quantity numeric(24,4) not null check(quantity>0),unit_price numeric(24,4) not null check(unit_price>=0),amount_minor numeric(38,0) not null check(amount_minor>=0),snapshot jsonb not null,primary key(company_id,id),unique(company_id,order_id,id),foreign key(company_id,order_id,order_version) references trade_business.order_versions(company_id,order_id,version));
create index order_lines_version on trade_business.order_lines(company_id,order_id,order_version);
create table trade_business.order_shares(company_id uuid not null,order_id uuid not null,user_id uuid not null,primary key(company_id,order_id,user_id),foreign key(company_id,order_id) references trade_business.orders(company_id,id));
create table trade_business.order_supplier_access(company_id uuid not null,order_id uuid not null,supplier_id uuid not null,supplier_kind text not null default 'supplier' check(supplier_kind='supplier'),primary key(company_id,order_id,supplier_id),foreign key(company_id,order_id) references trade_business.orders(company_id,id),foreign key(company_id,supplier_kind,supplier_id) references trade_business.business_records(company_id,kind,id));
grant select,insert,delete on trade_business.order_supplier_access to business_backend;
grant select,insert on trade_business.orders,trade_business.order_versions,trade_business.order_lines,trade_business.order_shares to business_backend;
grant update(owner_id,operations_id,state,version,source_version,currency,day,due_day,payload,total_minor) on trade_business.orders to business_backend;
commit;
