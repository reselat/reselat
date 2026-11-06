-- Private schema; no anon/authenticated grants, no model keys or public data API.
create table if not exists trade_business.assistant_resources (
 company_id uuid not null references trade_business.company_profiles(id),
 id uuid not null,
 kind text not null check (kind in ('knowledge','conversation')),
 owner_id uuid not null,
 data jsonb not null,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(company_id,id)
);
create index if not exists assistant_owner_idx on trade_business.assistant_resources(company_id,kind,owner_id);
revoke all on trade_business.assistant_resources from public;
grant select,insert,update on trade_business.assistant_resources to business_backend;

create table if not exists trade_business.assistant_calendars(company_id uuid primary key references trade_business.company_profiles(id),data jsonb not null,version integer not null default 1);
revoke all on trade_business.assistant_calendars from public;
grant select,insert,update on trade_business.assistant_calendars to business_backend;
