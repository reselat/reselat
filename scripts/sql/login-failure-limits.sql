begin;
create table trade_private.login_failure_counters(bucket_key text primary key check(bucket_key ~ '^[a-f0-9]{64}$'),failures integer not null default 0 check(failures>=0),window_start timestamptz not null default clock_timestamp());
revoke all on trade_private.login_failure_counters from public,anon,authenticated;
grant select,insert,update,delete on trade_private.login_failure_counters to identity_backend;
create index login_failure_expiry on trade_private.login_failure_counters(window_start);
commit;
