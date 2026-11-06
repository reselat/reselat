-- Additive permission needed to remove the departed employee's shared order access.
-- No business data is changed by this script. The application runs the handover separately.
begin;
grant delete on trade_business.order_shares to business_backend;
commit;
