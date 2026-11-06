begin;
alter table trade_business.business_records add column customer_code text;
with numbered as (select company_id,kind,id,row_number() over(partition by company_id order by created_at,id) as n from trade_business.business_records where kind='customer')
update trade_business.business_records r set customer_code='CUS-'||lpad(n.n::text,8,'0'),payload=jsonb_set(r.payload,'{customerStage}',coalesce(r.payload->'customerStage','"pending"'::jsonb)) from numbered n where r.company_id=n.company_id and r.kind=n.kind and r.id=n.id;
alter table trade_business.business_records add constraint customer_code_scope check((kind='customer' and customer_code is not null and customer_code ~ '^CUS-[0-9]{8}$') or (kind<>'customer' and customer_code is null));
create unique index customer_code_unique on trade_business.business_records(company_id,customer_code) where kind='customer';
insert into trade_business.number_counters(company_id,kind,value) select company_id,'CUSTOMER_CODE',count(*) from trade_business.business_records where kind='customer' group by company_id on conflict(company_id,kind) do update set value=greatest(trade_business.number_counters.value,excluded.value);
create function trade_business.assign_customer_code() returns trigger language plpgsql security invoker set search_path=pg_catalog,trade_business as $$
declare n bigint; stage jsonb;
begin
 if TG_OP='UPDATE' and NEW.customer_code is distinct from OLD.customer_code then raise exception 'CUSTOMER_CODE_IMMUTABLE' using errcode='42501'; end if;
 if NEW.kind='customer' then
  if NEW.customer_code is null then
   insert into trade_business.number_counters(company_id,kind,value) values(NEW.company_id,'CUSTOMER_CODE',1) on conflict(company_id,kind) do update set value=trade_business.number_counters.value+1 returning value into n;
   if n>99999999 then raise exception 'CUSTOMER_CODE_LIMIT'; end if;
   NEW.customer_code='CUS-'||lpad(n::text,8,'0');
  end if;
  if not (NEW.payload ? 'customerStage') then
   stage='"pending"'::jsonb;
   if TG_OP='UPDATE' then stage=coalesce(OLD.payload->'customerStage',stage); end if;
   NEW.payload=jsonb_set(NEW.payload,'{customerStage}',stage);
  end if;
 end if;
 return NEW;
end;
$$;
revoke all on function trade_business.assign_customer_code() from public;
grant execute on function trade_business.assign_customer_code() to business_backend;
create trigger business_customer_code before insert or update on trade_business.business_records for each row execute function trade_business.assign_customer_code();
-- The application role may insert/select codes but has no UPDATE grant on customer_code.
commit;
