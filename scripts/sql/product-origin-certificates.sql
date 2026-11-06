begin;
alter table trade_business.file_assets add column record_kind text;
alter table trade_business.file_assets add column record_id uuid;
alter table trade_business.file_assets drop constraint file_assets_category_check;
alter table trade_business.file_assets drop constraint file_assets_check;
alter table trade_business.file_assets add constraint file_assets_category_check check(category in ('customer','purchase','customs','document','signature','export','origin'));
alter table trade_business.file_assets add constraint file_assets_record_fk foreign key(company_id,record_kind,record_id) references trade_business.business_records(company_id,kind,id);
alter table trade_business.file_assets add constraint file_assets_scope_check check(
 (category='origin' and order_id is null and record_kind is not null and record_kind in ('product','supplier') and record_id is not null and size<=10485760 and mime in ('application/pdf','image/png','image/jpeg'))
 or (category='signature' and order_id is null and record_kind is null and record_id is null and size<=2097152 and mime in ('image/png','image/jpeg'))
 or (category not in ('signature','origin') and order_id is not null and record_kind is null and record_id is null and (category='export' or (size<=10485760 and mime in ('application/pdf','image/png','image/jpeg'))))
);
create index files_record_origin on trade_business.file_assets(company_id,record_kind,record_id,created_at) where category='origin';
commit;
