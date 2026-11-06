-- Deliberately owner-executed view: postgres can read these two Auth columns,
-- while app_backend cannot enter the platform-owned auth namespace.
-- Keep this view in the private schema and grant only its SELECT permission.
begin;
create view trade_private.active_auth_sessions as select id,user_id from auth.sessions;
revoke all on trade_private.active_auth_sessions from public;
grant select on trade_private.active_auth_sessions to app_backend;
commit;
