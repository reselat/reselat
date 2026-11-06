-- Forward migration on the existing identity project only. Not applied.
begin;
create role identity_backend nologin nosuperuser nocreatedb nocreaterole nobypassrls;
alter table trade_private.employees add column archived_at timestamptz;
alter table trade_private.employees add constraint archived_employee_disabled check(archived_at is null or not enabled);
grant insert on trade_private.employees to identity_backend;
grant update(display_name,archived_at) on trade_private.employees to identity_backend;
grant select on trade_private.audit_events to identity_backend;
create table trade_private.member_provisions(
 id uuid primary key,company_id uuid not null references trade_private.companies(id),actor_id uuid not null,
 display_name text not null,role text not null check(role in ('admin','sales','operations')),
 state text not null check(state in ('pending','auth_created','completed','needs_reconciliation','rejected')),
 auth_user_id uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(company_id,id)
);
revoke all on trade_private.member_provisions from public;
grant select,insert on trade_private.member_provisions to identity_backend;
grant update(state,auth_user_id,updated_at) on trade_private.member_provisions to identity_backend;
create or replace function trade_private.protect_last_admin() returns trigger language plpgsql security invoker set search_path=pg_catalog,trade_private as $$
begin
 if old.role='admin' and old.enabled and old.archived_at is null and (new.role<>'admin' or not new.enabled or new.archived_at is not null) then
  perform 1 from trade_private.companies where id=old.company_id for update;
  if not exists(select 1 from trade_private.employees where company_id=old.company_id and user_id<>old.user_id and role='admin' and enabled and archived_at is null) then
   raise exception 'LAST_ADMIN_REQUIRED' using errcode='23514';
  end if;
 end if;
 if new.user_id<>old.user_id or new.company_id<>old.company_id then raise exception 'EMPLOYEE_IDENTITY_IMMUTABLE' using errcode='23514';end if;
 return new;
end;$$;
grant usage on schema trade_private to identity_backend;
grant select on trade_private.companies,trade_private.employees,trade_private.audit_events,trade_private.active_auth_sessions to identity_backend;
grant update(name) on trade_private.companies to identity_backend;
grant update(role,enabled,version) on trade_private.employees to identity_backend;
grant insert on trade_private.audit_events to identity_backend;
grant usage on sequence trade_private.audit_events_id_seq to identity_backend;
grant execute on function trade_private.protect_last_admin() to identity_backend;
create table trade_private.deployment_identity(
 singleton boolean primary key default true check(singleton),
 purpose text not null check(purpose='identity'),
 project_ref text not null check(project_ref ~ '^[a-z0-9]{20}$')
);
revoke all on trade_private.deployment_identity from public;
grant select on trade_private.deployment_identity to identity_backend;
-- The reviewed cloud migration must append the actual project marker INSERT.
commit;
