-- Forward repair: restore the namespace access required by existing session-id checks.
-- No table/column privileges, Auth data, or authentication requirements change.
begin;
grant usage on schema auth to app_backend;
commit;
