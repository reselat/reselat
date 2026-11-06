begin;
create table trade_business.ai_application_settings(
 company_id uuid primary key references trade_business.company_profiles(id),
 version integer not null check(version>0),
 preferences jsonb not null check(jsonb_typeof(preferences)='object'),
 updated_by uuid not null,updated_at timestamptz not null default now()
);
alter table trade_business.ai_application_settings enable row level security;
create policy ai_settings_backend on trade_business.ai_application_settings to business_backend using(true) with check(true);
revoke all on trade_business.ai_application_settings from public;
do $$ declare role_name text; begin
 for role_name in select rolname from pg_roles where rolname in ('anon','authenticated') loop
  execute format('revoke all on trade_business.ai_application_settings from %I',role_name);
 end loop;
end $$;
grant select,insert on trade_business.ai_application_settings to business_backend;
grant update(version,preferences,updated_by,updated_at) on trade_business.ai_application_settings to business_backend;
-- Server-only preferences, never API keys. App enforces fresh admin + MFA + company scope.
commit;
