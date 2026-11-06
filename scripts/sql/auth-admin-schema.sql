-- Reviewed draft: local validation only. Not yet applied to Supabase.
create schema if not exists trade_private;
revoke all on schema trade_private from public;
create table trade_private.companies(id uuid primary key,name text not null,created_at timestamptz not null default now());
create table trade_private.employees(user_id uuid primary key,company_id uuid not null references trade_private.companies(id),display_name text not null default '',role text not null check(role in ('admin','sales','operations')),enabled boolean not null default false,version integer not null default 1 check(version>0),created_at timestamptz not null default now(),unique(company_id,user_id));
create index employees_company on trade_private.employees(company_id);
create table trade_private.audit_events(id bigint generated always as identity primary key,company_id uuid not null references trade_private.companies(id),actor_id uuid not null,subject_id uuid not null,action text not null,details jsonb not null default '{}',created_at timestamptz not null default now());
create function trade_private.protect_last_admin() returns trigger language plpgsql security invoker set search_path=pg_catalog,trade_private as $$
begin
 if old.role='admin' and old.enabled and (new.role<>'admin' or not new.enabled) then
  perform 1 from trade_private.companies where id=old.company_id for update;
  if not exists(select 1 from trade_private.employees where company_id=old.company_id and user_id<>old.user_id and role='admin' and enabled) then
   raise exception 'LAST_ADMIN_REQUIRED' using errcode='23514';
  end if;
 end if;
 if new.user_id<>old.user_id or new.company_id<>old.company_id then raise exception 'EMPLOYEE_IDENTITY_IMMUTABLE' using errcode='23514';end if;
 return new;
end;$$;
create trigger protect_last_admin before update on trade_private.employees for each row execute function trade_private.protect_last_admin();
-- Normalized object rows; no single shared Workspace JSON blob.
create table trade_private.business_records(id uuid not null,company_id uuid not null references trade_private.companies(id),kind text not null check(kind in ('customer','product','supplier')),owner_id uuid,version integer not null default 1 check(version>0),payload jsonb not null check(jsonb_typeof(payload)='object'),created_at timestamptz not null default now(),primary key(company_id,kind,id),foreign key(company_id,owner_id) references trade_private.employees(company_id,user_id));
create table trade_private.record_shares(company_id uuid not null,kind text not null,record_id uuid not null,user_id uuid not null,primary key(company_id,kind,record_id,user_id),foreign key(company_id,kind,record_id) references trade_private.business_records(company_id,kind,id),foreign key(company_id,user_id) references trade_private.employees(company_id,user_id));
-- Financial integration boundary only: no provider credentials or automatic calls.
create table trade_private.integration_outbox(id uuid primary key,company_id uuid not null references trade_private.companies(id),system_code text not null,external_id text,event_type text not null,idempotency_key text not null,status text not null default 'disabled' check(status in ('disabled','pending','sent','failed','needs_reconciliation')),created_at timestamptz not null default now(),unique(company_id,system_code,idempotency_key));
-- Dedicated application role is deliberately NOLOGIN until secure connection provisioning.
do $$begin if not exists(select 1 from pg_roles where rolname='app_backend') then create role app_backend nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;end if;end;$$;
grant usage on schema trade_private to app_backend;
grant select on trade_private.companies,trade_private.employees,trade_private.business_records,trade_private.record_shares to app_backend;
grant update(role,enabled,version) on trade_private.employees to app_backend;
grant insert on trade_private.business_records to app_backend;
grant update(payload,version) on trade_private.business_records to app_backend;
grant insert on trade_private.audit_events to app_backend;
grant usage on sequence trade_private.audit_events_id_seq to app_backend;
revoke all on all functions in schema trade_private from public;
grant execute on function trade_private.protect_last_admin() to app_backend;
-- SELECT ... FOR UPDATE requires UPDATE privilege on at least one column.
-- Grant only the mutable company display name, never its identity.
grant update(name) on trade_private.companies to app_backend;
-- Read only current Auth session identities to reject revoked admin sessions.
-- Supabase owns auth.sessions; no writes or broad Auth grants are added.
do $$begin if to_regclass('auth.sessions') is not null then
 grant usage on schema auth to app_backend;
 grant select(id,user_id) on auth.sessions to app_backend;
end if;end;$$;
