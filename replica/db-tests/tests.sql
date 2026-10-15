\set ON_ERROR_STOP 1
-- fixtures: two tenants
insert into organizations (id,name) values ('00000000-0000-0000-0000-00000000000a','Org A'),('00000000-0000-0000-0000-00000000000b','Org B');
insert into outlets (id,org_id,name,slug) values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000a','A1','a1'),
 ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-00000000000a','A2','a2'),
 ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000000b','B1','b1');
insert into areas (id,org_id,outlet_id,name) values ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a1','AC');
insert into tables (id,org_id,outlet_id,area_id,name) values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','T1');
insert into orders (id,org_id,outlet_id,business_date,order_no,type,source) values
 ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a1','2026-10-15','1','dine_in','pos'),
 ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a1','2026-10-15','2','dine_in','pos'),
 ('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a2','2026-10-15','1','takeaway','pos'),
 ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-0000000000b1','2026-10-15','1','takeaway','pos');

\echo T1 one running order per table
insert into order_tables (org_id,outlet_id,order_id,table_id) values ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1');
do $$ begin
  insert into order_tables (org_id,outlet_id,order_id,table_id) values ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000d1');
  raise exception 'FAIL: second running order allowed';
exception when unique_violation then raise notice 'PASS second running order rejected'; end $$;
update order_tables set released_at = now();
insert into order_tables (org_id,outlet_id,order_id,table_id) values ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000d1');
\echo PASS table reusable after release

\echo T2 numbering
select app.next_number('00000000-0000-0000-0000-0000000000a1','bill','T1','2026-27') as n1,
       app.next_number('00000000-0000-0000-0000-0000000000a1','bill','T1','2026-27') as n2,
       app.next_number('00000000-0000-0000-0000-0000000000a1','bill','T2','2026-27') as other_series;

\echo T3 fiscal year + business date (expect 2026-27, 2025-26, 2026-10-14, 2026-10-15)
select app.fiscal_year('2026-04-01'), app.fiscal_year('2026-03-31'),
       app.business_date('00000000-0000-0000-0000-0000000000a1','2026-10-14 22:00:00+00'),   -- 03:30 IST on 15th -> 14th
       app.business_date('00000000-0000-0000-0000-0000000000a1','2026-10-15 00:00:00+00');   -- 05:30 IST -> 15th

\echo T4 bill total must add up
do $$ begin
  insert into bills (id,org_id,outlet_id,order_id,business_date,series_code,fiscal_year,bill_no,subtotal_paise,tax_paise,total_paise)
  values (gen_random_uuid(),'00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1','2026-10-15','T1','2026-27',1,10000,500,10600);
  raise exception 'FAIL: wrong total accepted';
exception when check_violation then raise notice 'PASS wrong total rejected'; end $$;
insert into bills (id,org_id,outlet_id,order_id,business_date,series_code,fiscal_year,bill_no,subtotal_paise,tax_paise,round_off_paise,total_paise)
values ('00000000-0000-0000-0000-0000000000b0','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1','2026-10-15','T1','2026-27',1,10000,500,0,10500);
do $$ begin
  insert into bills (id,org_id,outlet_id,order_id,business_date,series_code,fiscal_year,bill_no,subtotal_paise,total_paise)
  values (gen_random_uuid(),'00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1','2026-10-15','T1','2026-27',1,100,100);
  raise exception 'FAIL: duplicate bill number';
exception when unique_violation then raise notice 'PASS duplicate bill number rejected'; end $$;

\echo T5 audit append-only
insert into audit_log (org_id,actor_kind,action,entity,entity_id) values ('00000000-0000-0000-0000-00000000000a','staff','kot.void','kot',gen_random_uuid());
do $$ begin
  delete from audit_log;
  raise exception 'FAIL: audit delete allowed';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if; raise notice 'PASS audit delete blocked'; end $$;

\echo T6 RLS: device of outlet A1 sees only A1 orders; org B sees only B; no claims sees nothing
set role authenticated;
set request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-00000000000a","outlet_ids":["00000000-0000-0000-0000-0000000000a1"]}';
select 'A1 device' who, count(*) orders, count(*) filter (where outlet_id <> '00000000-0000-0000-0000-0000000000a1') leaked from orders;
set request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-00000000000a","all_outlets":true}';
select 'A owner' who, count(*) orders from orders;
set request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-00000000000b","all_outlets":true}';
select 'B owner' who, count(*) orders, count(*) filter (where org_id <> '00000000-0000-0000-0000-00000000000b') leaked from orders;
set request.jwt.claims = '{}';
select 'no claims' who, (select count(*) from orders) orders, (select count(*) from outlets) outlets;
\echo T7 server-only tables invisible, writes blocked for clients
set request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-00000000000a","all_outlets":true}';
select 'staff_secrets visible' t, count(*) from staff_secrets;
do $$ begin
  insert into orders (id,org_id,outlet_id,business_date,order_no,type,source) values (gen_random_uuid(),'00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a1','2026-10-15','9','takeaway','pos');
  raise exception 'FAIL: client insert allowed';
exception when insufficient_privilege then raise notice 'PASS client insert blocked'; end $$;
reset role;

\echo T8 foreign keys without a leading index
select c.conrelid::regclass tbl, a.attname col
from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
where c.contype='f' and array_length(c.conkey,1)=1
  and not exists (select 1 from pg_index i where i.indrelid=c.conrelid and i.indkey[0]=c.conkey[1]);
