-- Core schema. Derived from replica/schema.sql; this file is now the source of truth.
-- Postgres 15+ (Supabase, Neon or plain). Rules used throughout:
--   * uuid ids, created_at / updated_at timestamptz (UTC)
--   * every row carries org_id (tenant); outlet-scoped rows also carry outlet_id
--   * money = bigint paise (1 INR = 100) + currency on the outlet / bill
--   * percentages = integer basis points (250 = 2.50%)
--   * quantities for stock = numeric(14,3) in the material's base unit
--   * status columns are text + check constraints (easier to evolve than enums)
--   * access: the server writes as the table owner after a per-command authorisation
--     check; tenant reads run as role app_reader with claims set per transaction
--     (set local app.claims = '{...}'), so RLS isolates tenants even if a query forgets.

create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists app;

do $$ begin create role app_reader nologin; exception when duplicate_object then null; end $$;
grant app_reader to current_user;
grant usage on schema app to app_reader;

-- Claims for the current transaction, set by the server: set local app.claims = '{"org_id":...}'.
create or replace function app.claims() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('app.claims', true), ''), '{}')::jsonb
$$;

create or replace function app.org_id() returns uuid
language sql stable as $$
  select nullif(app.claims() ->> 'org_id', '')::uuid
$$;

create or replace function app.all_outlets() returns boolean
language sql stable as $$
  select coalesce((app.claims() ->> 'all_outlets')::boolean, false)
$$;

create or replace function app.can_outlet(p_outlet uuid) returns boolean
language sql stable as $$
  select app.all_outlets()
      or p_outlet::text in (select jsonb_array_elements_text(coalesce(app.claims() -> 'outlet_ids', '[]'::jsonb)))
$$;

create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ============================================================
-- Tenancy, people, devices
-- ============================================================

create table organizations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid generated always as (id) stored,          -- uniform RLS
  name text not null,
  country char(2) not null default 'IN',
  currency char(3) not null default 'INR',
  timezone text not null default 'Asia/Kolkata',
  loyalty_settings jsonb not null default '{}',         -- points per 100 paise, expiry days, caps (P4)
  status text not null default 'trial'
    check (status in ('trial','active','past_due','read_only','cancelled')),
  trial_ends_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  provider text not null check (provider in ('razorpay','stripe')),
  provider_customer_id text,
  provider_subscription_id text unique,
  plan text not null check (plan in ('core','growth','scale')),
  addons text[] not null default '{}',
  outlet_quantity int not null default 1 check (outlet_quantity > 0),
  status text not null check (status in ('trialing','active','past_due','cancelled','paused')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  checkout_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on subscriptions (org_id);

create table outlets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  slug citext not null,                                  -- public QR/website URLs
  address text,
  city text,
  state_code char(2),                                    -- GST state code, drives CGST+SGST vs IGST
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  gst_scheme text not null default 'regular' check (gst_scheme in ('regular','composition','unregistered')),
  fssai_no text,
  sac_code text not null default '996331',
  currency char(3) not null default 'INR',
  timezone text not null default 'Asia/Kolkata',
  day_starts_at time not null default '05:00',           -- business date boundary
  order_types text[] not null default '{dine_in,takeaway,delivery}',
  price_includes_tax boolean not null default false,
  round_off boolean not null default true,
  bill_header text, bill_footer text,
  is_central_kitchen boolean not null default false,
  online_status text not null default 'off' check (online_status in ('on','off')),
  online_turn_on_at timestamptz,
  min_order_paise bigint not null default 0 check (min_order_paise >= 0),
  delivery_charge_paise bigint not null default 0 check (delivery_charge_paise >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slug)
);
create index on outlets (org_id);

-- Back-office users (owners, managers) are Better Auth users ("user" table).
create table org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  role text not null check (role in ('owner','admin','manager','accountant')),
  all_outlets boolean not null default false,
  outlet_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index on org_members (user_id);

create table roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  rights text[] not null default '{}',                   -- e.g. 'kot.cancel','bill.modify_after_settle','discount.give'
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);

-- Floor staff log in on a shared terminal with a PIN. Not auth users.
create table staff (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  role_id uuid not null references roles(id) on delete restrict,
  name text not null,
  phone text,
  outlet_ids uuid[] not null default '{}',
  active boolean not null default true,
  failed_pin_attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on staff (org_id);
create index on staff (role_id);
create index on staff using gin (outlet_ids);

-- PIN hashes live apart from staff so no client-readable row ever carries them.
create table staff_secrets (
  staff_id uuid primary key references staff(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  pin_hash text not null,                                -- argon2id, never the PIN
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on staff_secrets (org_id);

-- A paired terminal (POS, captain phone, KDS screen, kiosk). Pairing gives the browser a
-- long-lived random token in an http-only cookie; only its hash is stored.
create table devices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  token_hash text unique,
  kind text not null check (kind in ('pos','captain','kds','kiosk')),
  name text not null,
  series_code text not null,                             -- bill number series for offline-safe numbering, e.g. 'T1'
  station_id uuid,                                       -- KDS screens; fk added below
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outlet_id, series_code)
);
create index on devices (org_id);
create index on devices (outlet_id);

create table staff_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,
  device_id uuid not null references devices(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on staff_sessions (staff_id);
create index on staff_sessions (device_id);
create index on staff_sessions (outlet_id);
create index on staff_sessions (org_id);

-- ============================================================
-- Menu
-- ============================================================

create table stations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  name text not null,
  kds_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outlet_id, name)
);
create index on stations (org_id);
alter table devices add constraint devices_station_fk
  foreign key (station_id) references stations(id) on delete set null;
create index on devices (station_id);

create table printers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  station_id uuid references stations(id) on delete set null,  -- null = bill printer
  name text not null,
  purpose text not null check (purpose in ('kot','bill','both')),
  connection text not null check (connection in ('network','usb','bluetooth','browser')),
  address text,                                          -- ip:port for network printers
  paper_mm int not null default 80 check (paper_mm in (58,80)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on printers (org_id);
create index on printers (outlet_id);
create index on printers (station_id);

create table categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  parent_id uuid references categories(id) on delete set null,
  name text not null,
  station_id uuid references stations(id) on delete set null,  -- default station for its items
  available_from time, available_to time,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on categories (org_id);
create index on categories (outlet_id, sort);
create index on categories (parent_id);
create index on categories (station_id);

create table taxes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  name text not null,                                    -- 'CGST 2.5%', 'SGST 2.5%', 'Service charge'
  kind text not null check (kind in ('cgst','sgst','igst','vat','cess','service_charge','other')),
  rate_bp int check (rate_bp between 0 and 10000),
  fixed_paise bigint check (fixed_paise >= 0),
  applies_on text not null default 'core' check (applies_on in ('core','total')),
  order_types text[] not null default '{dine_in,takeaway,delivery,online,qr,kiosk}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((rate_bp is null) <> (fixed_paise is null))
);
create index on taxes (org_id);
create index on taxes (outlet_id);

create table items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  category_id uuid not null references categories(id) on delete restrict,
  station_id uuid references stations(id) on delete set null,
  name text not null,
  shortcode text,
  description text,
  food_type text not null default 'veg' check (food_type in ('veg','non_veg','egg')),
  price_paise bigint not null check (price_paise >= 0),
  packaging_paise bigint not null default 0 check (packaging_paise >= 0),
  in_stock boolean not null default true,
  auto_turn_on_at timestamptz,
  available_from time, available_to time,
  is_combo boolean not null default false,
  image_path text,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on items (org_id);
create index on items (outlet_id, category_id, sort);
create index on items (category_id);
create index on items (station_id);
create unique index items_shortcode_uq on items (outlet_id, lower(shortcode)) where shortcode is not null;

-- Price override per order type / channel (e.g. higher online price).
create table item_prices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  order_type text not null check (order_type in ('dine_in','takeaway','delivery','online','qr','kiosk')),
  price_paise bigint not null check (price_paise >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, order_type)
);
create index on item_prices (org_id);
create index on item_prices (outlet_id);

create table item_taxes (
  item_id uuid not null references items(id) on delete cascade,
  tax_id uuid not null references taxes(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  primary key (item_id, tax_id)
);
create index on item_taxes (tax_id);
create index on item_taxes (org_id);

create table variations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  name text not null,
  price_paise bigint not null check (price_paise >= 0),
  in_stock boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on variations (org_id);
create index on variations (item_id, sort);
create index on variations (outlet_id);

create table addon_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  name text not null,
  min_select int not null default 0 check (min_select >= 0),
  max_select int check (max_select is null or max_select >= min_select),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on addon_groups (org_id);
create index on addon_groups (outlet_id);

create table addons (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  group_id uuid not null references addon_groups(id) on delete cascade,
  name text not null,
  price_paise bigint not null default 0 check (price_paise >= 0),
  food_type text not null default 'veg' check (food_type in ('veg','non_veg','egg')),
  in_stock boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on addons (org_id);
create index on addons (group_id, sort);
create index on addons (outlet_id);

create table item_addon_groups (
  item_id uuid not null references items(id) on delete cascade,
  group_id uuid not null references addon_groups(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  sort int not null default 0,
  primary key (item_id, group_id)
);
create index on item_addon_groups (group_id);
create index on item_addon_groups (org_id);

create table combo_components (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  combo_item_id uuid not null references items(id) on delete cascade,
  component_item_id uuid not null references items(id) on delete restrict,
  qty int not null default 1 check (qty > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (combo_item_id <> component_item_id)
);
create index on combo_components (org_id);
create index on combo_components (combo_item_id);
create index on combo_components (component_item_id);

create table discounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid references outlets(id) on delete cascade,  -- null = all outlets
  name text not null,
  kind text not null check (kind in ('percent','flat')),
  value int not null check (value > 0),                  -- bp for percent, paise for flat
  level text not null check (level in ('item','category','bill')),
  target_ids uuid[] not null default '{}',               -- item/category ids for item/category level
  max_paise bigint check (max_paise > 0),
  min_bill_paise bigint not null default 0,
  order_types text[] not null default '{dine_in,takeaway,delivery,online,qr,kiosk}',
  coupon_code citext,
  requires_right boolean not null default true,
  valid_from timestamptz, valid_to timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'percent' or value <= 10000),
  check (valid_to is null or valid_from is null or valid_to > valid_from)
);
create index on discounts (org_id);
create index on discounts (outlet_id);
create unique index discounts_coupon_uq on discounts (org_id, coupon_code) where coupon_code is not null;

-- ============================================================
-- Floor
-- ============================================================

create table areas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  name text not null,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outlet_id, name)
);
create index on areas (org_id);

create table tables (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  area_id uuid not null references areas(id) on delete restrict,
  name text not null,
  seats int not null default 4 check (seats > 0),
  qr_token text not null unique default encode(gen_random_bytes(10), 'hex'),
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outlet_id, name)
);
create index on tables (org_id);
create index on tables (area_id, sort);

-- ============================================================
-- Customers (needed by orders)
-- ============================================================

create table customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  phone text not null,                                   -- E.164
  name text,
  email citext,
  gstin text,
  addresses jsonb not null default '[]',
  birthday date, anniversary date,
  tags text[] not null default '{}',
  marketing_opt_in boolean not null default false,
  first_visit_at timestamptz, last_visit_at timestamptz,
  visits int not null default 0,
  total_spend_paise bigint not null default 0,
  deleted_at timestamptz,                                -- erasure: PII nulled, row kept for bill integrity
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, phone)
);
create index on customers (org_id, last_visit_at);
create index on customers using gin (tags);

-- ============================================================
-- Online channels (needed by orders)
-- ============================================================

create table channels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  kind text not null check (kind in ('website','qr','kiosk','aggregator')),
  provider text,                                         -- e.g. 'urbanpiper' middleware; null for own channels
  external_store_id text,
  credentials_secret_id uuid,                            -- Supabase Vault secret id, never plaintext here
  auto_accept boolean not null default false,
  default_prep_minutes int not null default 20 check (default_prep_minutes between 1 and 240),
  status text not null default 'active' check (status in ('active','paused','error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outlet_id, kind, provider)
);
create index on channels (org_id);

-- ============================================================
-- Orders, KOTs, bills, payments
-- ============================================================

-- Gap-free number series: KOT serials per business date, bill numbers per series + fiscal year.
create table number_series (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  kind text not null check (kind in ('bill','kot','order','token')),
  series_code text not null,                             -- device series ('T1') or 'ONLINE'
  period text not null,                                  -- fiscal year '2026-27' for bills, business date for KOT/token
  next_no bigint not null default 1 check (next_no > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outlet_id, kind, series_code, period)
);
create index on number_series (org_id);

create table orders (
  id uuid primary key,                                   -- generated on the client (offline-safe)
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete restrict,
  business_date date not null,
  order_no text not null,
  type text not null check (type in ('dine_in','takeaway','delivery','online','qr','kiosk')),
  source text not null check (source in ('pos','captain','qr','website','aggregator','kiosk')),
  channel_id uuid references channels(id) on delete set null,
  channel_order_id text,
  customer_id uuid references customers(id) on delete set null,
  created_by_staff_id uuid references staff(id) on delete set null,
  captain_staff_id uuid references staff(id) on delete set null,
  device_id uuid references devices(id) on delete set null,
  pax int check (pax > 0),
  status text not null default 'open'
    check (status in ('open','billed','settled','cancelled','merged')),
  online_status text
    check (online_status in ('new','accepted','preparing','ready','dispatched','delivered','rejected')),
  prep_minutes int,
  merged_into_order_id uuid references orders(id) on delete set null,
  qr_validation_code text,
  qr_validated_at timestamptz,
  delivery_address jsonb,
  notes text,
  cancel_reason text,
  client_created_at timestamptz,                         -- device clock, for offline orders
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outlet_id, business_date, order_no),
  check (status <> 'cancelled' or cancel_reason is not null)
);
create index on orders (org_id);
create index on orders (outlet_id, business_date, status);
create index on orders (outlet_id, status) where status in ('open','billed');
create index on orders (customer_id);
create index on orders (channel_id);
create index on orders (captain_staff_id);
create index on orders (created_by_staff_id);
create index on orders (device_id);
create index on orders (merged_into_order_id);
create unique index orders_channel_uq on orders (channel_id, channel_order_id) where channel_order_id is not null;

-- Which tables an order occupies. One running order per table, enforced here.
create table order_tables (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  table_id uuid not null references tables(id) on delete restrict,
  seated_at timestamptz not null default now(),
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index order_tables_one_running on order_tables (table_id) where released_at is null;
create index on order_tables (order_id);
create index on order_tables (org_id);
create index on order_tables (outlet_id);

create table order_items (
  id uuid primary key,                                   -- client-generated
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  item_id uuid references items(id) on delete set null, -- snapshot below survives menu edits
  variation_id uuid references variations(id) on delete set null,
  station_id uuid references stations(id) on delete set null,
  name text not null,
  variation_name text,
  addons jsonb not null default '[]',                    -- [{addon_id,name,price_paise,qty}]
  qty numeric(10,3) not null check (qty > 0),
  unit_price_paise bigint not null check (unit_price_paise >= 0),   -- incl. addons
  discount_paise bigint not null default 0 check (discount_paise >= 0),
  tax_ids uuid[] not null default '{}',
  note text,
  status text not null default 'active' check (status in ('active','void')),
  void_reason text,
  voided_by_staff_id uuid references staff(id) on delete set null,
  is_nc boolean not null default false,                  -- complimentary line
  added_by_staff_id uuid references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'void' or void_reason is not null)
);
create index on order_items (order_id);
create index on order_items (org_id);
create index on order_items (outlet_id, created_at);
create index on order_items (item_id);
create index on order_items (variation_id);
create index on order_items (station_id);
create index on order_items (voided_by_staff_id);
create index on order_items (added_by_staff_id);

create table kots (
  id uuid primary key,                                   -- client-generated
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  station_id uuid references stations(id) on delete set null,
  business_date date not null,
  kot_no text not null,
  kind text not null default 'new' check (kind in ('new','void')),
  kds_status text not null default 'new' check (kds_status in ('new','preparing','ready','served','recalled')),
  ready_at timestamptz,
  created_by_staff_id uuid references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outlet_id, business_date, kot_no)
);
create index on kots (order_id);
create index on kots (org_id);
create index on kots (station_id, kds_status, created_at);
create index on kots (created_by_staff_id);

create table kot_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  kot_id uuid not null references kots(id) on delete cascade,
  order_item_id uuid not null references order_items(id) on delete cascade,
  qty numeric(10,3) not null,                            -- negative on a void KOT
  ready boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (qty <> 0)
);
create index on kot_items (kot_id);
create index on kot_items (order_item_id);
create index on kot_items (org_id);
create index on kot_items (outlet_id);

create table bills (
  id uuid primary key,                                   -- client-generated
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete restrict,
  order_id uuid not null references orders(id) on delete restrict,
  business_date date not null,
  series_code text not null,
  fiscal_year text not null check (fiscal_year ~ '^[0-9]{4}-[0-9]{2}$'),
  bill_no bigint not null check (bill_no > 0),
  split_index int not null default 1 check (split_index > 0),
  split_count int not null default 1 check (split_count >= split_index),
  customer_id uuid references customers(id) on delete set null,
  customer_gstin text,
  place_of_supply char(2),
  currency char(3) not null default 'INR',
  subtotal_paise bigint not null check (subtotal_paise >= 0),
  discount_paise bigint not null default 0 check (discount_paise >= 0),
  charges_paise bigint not null default 0 check (charges_paise >= 0),
  tax_paise bigint not null default 0 check (tax_paise >= 0),
  round_off_paise bigint not null default 0 check (round_off_paise between -99 and 99),
  total_paise bigint not null check (total_paise >= 0),
  tip_paise bigint not null default 0 check (tip_paise >= 0),
  is_nc boolean not null default false,
  nc_reason text,
  status text not null default 'open' check (status in ('open','settled','cancelled')),
  print_count int not null default 0,
  settled_at timestamptz,
  cancelled_reason text,
  created_by_staff_id uuid references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outlet_id, series_code, fiscal_year, bill_no),
  check (total_paise = subtotal_paise - discount_paise + charges_paise + tax_paise + round_off_paise
         or is_nc),
  check (not is_nc or nc_reason is not null),
  check (status <> 'cancelled' or cancelled_reason is not null)
);
create index on bills (org_id);
create index on bills (order_id);
create index on bills (outlet_id, business_date, status);
create index on bills (customer_id);
create index on bills (created_by_staff_id);

-- Which order lines (and how much of each) a bill covers. Item-wise splits use qty;
-- equal/custom splits use share_bp of every line.
create table bill_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  bill_id uuid not null references bills(id) on delete cascade,
  order_item_id uuid not null references order_items(id) on delete restrict,
  qty numeric(10,3) not null check (qty > 0),
  share_bp int not null default 10000 check (share_bp between 1 and 10000),
  amount_paise bigint not null check (amount_paise >= 0),
  discount_paise bigint not null default 0 check (discount_paise >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on bill_lines (bill_id);
create index on bill_lines (order_item_id);
create index on bill_lines (org_id);
create index on bill_lines (outlet_id);

-- One row per tax per bill: the GST report reads this, never re-computes.
create table bill_taxes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  bill_id uuid not null references bills(id) on delete cascade,
  tax_id uuid references taxes(id) on delete set null,
  name text not null,
  kind text not null,
  rate_bp int,
  taxable_paise bigint not null check (taxable_paise >= 0),
  amount_paise bigint not null check (amount_paise >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on bill_taxes (bill_id);
create index on bill_taxes (tax_id);
create index on bill_taxes (org_id);
create index on bill_taxes (outlet_id);

create table bill_discounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  bill_id uuid not null references bills(id) on delete cascade,
  discount_id uuid references discounts(id) on delete set null,
  name text not null,
  amount_paise bigint not null check (amount_paise > 0),
  approved_by_staff_id uuid references staff(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on bill_discounts (bill_id);
create index on bill_discounts (discount_id);
create index on bill_discounts (org_id);
create index on bill_discounts (outlet_id);
create index on bill_discounts (approved_by_staff_id);

create table payments (
  id uuid primary key,                                   -- client-generated = idempotent
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete restrict,
  bill_id uuid not null references bills(id) on delete restrict,
  business_date date not null,
  method text not null check (method in ('cash','card','upi','wallet','due','online','other')),
  amount_paise bigint not null check (amount_paise <> 0),   -- negative = refund
  tendered_paise bigint,                                 -- cash given, for change
  reference text,                                        -- UPI RRN / card last4 / gateway id
  received_by_staff_id uuid references staff(id) on delete set null,
  due_settled_by_payment_id uuid references payments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on payments (bill_id);
create index on payments (org_id);
create index on payments (outlet_id, business_date, method);
create index on payments (received_by_staff_id);
create index on payments (due_settled_by_payment_id);

create table day_ends (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  business_date date not null,
  opening_cash_paise bigint not null default 0,
  expected_cash_paise bigint not null,
  counted_cash_paise bigint not null,
  variance_paise bigint generated always as (counted_cash_paise - expected_cash_paise) stored,
  summary jsonb not null,                                -- frozen totals by biller, method, order type
  closed_by_staff_id uuid references staff(id) on delete set null,
  closed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outlet_id, business_date)
);
create index on day_ends (org_id);
create index on day_ends (closed_by_staff_id);

create table print_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  printer_id uuid references printers(id) on delete set null,
  kind text not null check (kind in ('kot','void_kot','bill','reprint','day_end','token')),
  ref_id uuid not null,
  payload jsonb not null,                                -- rendered lines, not raw ESC/POS
  status text not null default 'queued' check (status in ('queued','sent','printed','failed')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on print_jobs (outlet_id, status, created_at);
create index on print_jobs (org_id);
create index on print_jobs (printer_id);

-- ============================================================
-- Reservations (P2)
-- ============================================================

create table reservations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  guest_name text not null,
  guest_phone text not null,
  party_size int not null check (party_size > 0),
  reserved_for timestamptz not null,
  table_id uuid references tables(id) on delete set null,
  kind text not null default 'booking' check (kind in ('booking','waitlist')),
  status text not null default 'booked' check (status in ('booked','seated','no_show','cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on reservations (outlet_id, reserved_for);
create index on reservations (org_id);
create index on reservations (customer_id);
create index on reservations (table_id);

-- ============================================================
-- Inventory (P3)
-- ============================================================

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  phone text, email citext, gstin text, address text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on suppliers (org_id);

create table raw_materials (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  category text,
  base_unit text not null check (base_unit in ('g','ml','pc')),
  purchase_unit text not null,                           -- 'kg','l','box'
  purchase_to_base numeric(14,4) not null check (purchase_to_base > 0),
  is_semi_finished boolean not null default false,
  has_expiry boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);

create table stock_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  raw_material_id uuid not null references raw_materials(id) on delete cascade,
  min_level numeric(14,3) not null default 0,
  last_cost_paise_per_base numeric(14,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outlet_id, raw_material_id)
);
create index on stock_settings (org_id);
create index on stock_settings (raw_material_id);

create table recipes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  item_id uuid references items(id) on delete cascade,
  variation_id uuid references variations(id) on delete cascade,
  addon_id uuid references addons(id) on delete cascade,
  produces_raw_material_id uuid references raw_materials(id) on delete cascade,  -- semi-finished
  yield_qty numeric(14,3) not null default 1 check (yield_qty > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(item_id, variation_id, addon_id, produces_raw_material_id) = 1)
);
create unique index recipes_item_uq on recipes (item_id) where item_id is not null;
create unique index recipes_variation_uq on recipes (variation_id) where variation_id is not null;
create unique index recipes_addon_uq on recipes (addon_id) where addon_id is not null;
create unique index recipes_semi_uq on recipes (produces_raw_material_id) where produces_raw_material_id is not null;
create index on recipes (org_id);

create table recipe_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  recipe_id uuid not null references recipes(id) on delete cascade,
  raw_material_id uuid not null references raw_materials(id) on delete restrict,
  qty numeric(14,3) not null check (qty > 0),            -- base unit
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipe_id, raw_material_id)
);
create index on recipe_lines (raw_material_id);
create index on recipe_lines (org_id);

create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete restrict,
  from_outlet_id uuid references outlets(id) on delete restrict,   -- central kitchen as supplier
  po_no text not null,
  status text not null default 'draft' check (status in ('draft','sent','partial','received','cancelled')),
  expected_on date,
  lines jsonb not null default '[]',                     -- [{raw_material_id, qty, rate_paise}]
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outlet_id, po_no),
  check (num_nonnulls(supplier_id, from_outlet_id) = 1)
);
create index on purchase_orders (org_id);
create index on purchase_orders (supplier_id);
create index on purchase_orders (from_outlet_id);
create index on purchase_orders (outlet_id, status);

create table purchases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete restrict,
  purchase_order_id uuid references purchase_orders(id) on delete set null,
  invoice_no text not null,
  invoice_date date not null,
  subtotal_paise bigint not null check (subtotal_paise >= 0),
  tax_paise bigint not null default 0 check (tax_paise >= 0),
  total_paise bigint not null check (total_paise >= 0),
  paid_paise bigint not null default 0 check (paid_paise >= 0),
  status text not null default 'draft' check (status in ('draft','posted','void')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_id, invoice_no)
);
create index on purchases (org_id);
create index on purchases (outlet_id, invoice_date);
create index on purchases (purchase_order_id);

create table purchase_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  purchase_id uuid not null references purchases(id) on delete cascade,
  raw_material_id uuid not null references raw_materials(id) on delete restrict,
  qty_purchase_unit numeric(14,3) not null check (qty_purchase_unit > 0),
  rate_paise bigint not null check (rate_paise >= 0),
  tax_bp int not null default 0,
  expires_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on purchase_lines (purchase_id);
create index on purchase_lines (raw_material_id);
create index on purchase_lines (org_id);
create index on purchase_lines (outlet_id);

create table stock_transfers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  from_outlet_id uuid not null references outlets(id) on delete restrict,
  to_outlet_id uuid not null references outlets(id) on delete restrict,
  transfer_no text not null,
  status text not null default 'requested'
    check (status in ('requested','dispatched','received','rejected','cancelled')),
  lines jsonb not null default '[]',                     -- [{raw_material_id, requested, dispatched, received}]
  requested_at timestamptz not null default now(),
  dispatched_at timestamptz, received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, transfer_no),
  check (from_outlet_id <> to_outlet_id)
);
create index on stock_transfers (org_id);
create index on stock_transfers (from_outlet_id, status);
create index on stock_transfers (to_outlet_id, status);

create table stock_counts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  counted_on date not null,
  status text not null default 'draft' check (status in ('draft','posted')),
  lines jsonb not null default '[]',                     -- [{raw_material_id, system_qty, counted_qty}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on stock_counts (org_id);
create index on stock_counts (outlet_id, counted_on);

-- The single source of truth for stock. Current stock = sum(qty) per outlet + material.
create table stock_ledger (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  raw_material_id uuid not null references raw_materials(id) on delete restrict,
  qty numeric(14,3) not null check (qty <> 0),
  reason text not null check (reason in ('sale','sale_void','purchase','purchase_return','transfer_in',
                                         'transfer_out','wastage','count_adjust','production_in','production_out','opening')),
  ref_type text not null,
  ref_id uuid not null,
  note text,
  cost_paise_per_base numeric(14,4),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ref_type, ref_id, raw_material_id, reason)    -- idempotent posting
);
create index on stock_ledger (outlet_id, raw_material_id, occurred_at);
create index on stock_ledger (raw_material_id);
create index on stock_ledger (org_id);

create view stock_levels with (security_invoker = true) as
  select org_id, outlet_id, raw_material_id, sum(qty) as qty
  from stock_ledger group by org_id, outlet_id, raw_material_id;

-- ============================================================
-- CRM & loyalty (P4)
-- ============================================================

create table loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid references outlets(id) on delete set null,
  customer_id uuid not null references customers(id) on delete cascade,
  kind text not null check (kind in ('points','wallet')),
  entry text not null check (entry in ('earn','redeem','expire','recharge','bonus','adjust','refund')),
  amount bigint not null check (amount <> 0),            -- points, or paise for wallet
  bill_id uuid references bills(id) on delete set null,
  expires_at timestamptz,
  otp_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bill_id, kind, entry)
);
create index on loyalty_ledger (customer_id, kind);
create index on loyalty_ledger (org_id);
create index on loyalty_ledger (outlet_id);
create index on loyalty_ledger (expires_at) where expires_at is not null;

create table otp_challenges (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  purpose text not null check (purpose in ('loyalty_redeem','wallet_redeem')),
  code_hash text not null,
  attempts int not null default 0 check (attempts <= 5),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on otp_challenges (customer_id, expires_at);
create index on otp_challenges (org_id);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  channel text not null check (channel in ('sms','whatsapp','email')),
  segment jsonb not null,                                -- {last_visit_before_days: 30, outlets: [...]}
  template_id text,                                      -- DLT / WhatsApp approved template
  body text not null,
  trigger text not null default 'once' check (trigger in ('once','birthday','anniversary','lapsed')),
  scheduled_at timestamptz,
  status text not null default 'draft' check (status in ('draft','scheduled','sending','sent','failed','cancelled')),
  stats jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on campaigns (org_id, status, scheduled_at);

create table campaign_sends (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  provider_message_id text,
  status text not null default 'queued' check (status in ('queued','sent','delivered','failed','opted_out')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, customer_id)
);
create index on campaign_sends (customer_id);
create index on campaign_sends (org_id);

create table feedback (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  bill_id uuid references bills(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bill_id)
);
create index on feedback (outlet_id, created_at);
create index on feedback (org_id);
create index on feedback (customer_id);

-- ============================================================
-- Integration plumbing, audit, idempotency
-- ============================================================

-- Raw inbound webhooks (payments gateway, channel middleware). Processed by a job.
create table inbound_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  source text not null,                                  -- 'razorpay','stripe','urbanpiper',...
  external_id text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);
create index on inbound_events (processed_at) where processed_at is null;
create index on inbound_events (org_id);

-- Every POS command from a device carries a client mutation id. Replays return the stored result.
create table idempotency_keys (
  key text primary key,                                  -- device_id:mutation_id
  org_id uuid not null references organizations(id) on delete cascade,
  command text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on idempotency_keys (org_id);
create index on idempotency_keys (created_at);

create table audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid references outlets(id) on delete set null,
  actor_kind text not null check (actor_kind in ('staff','member','system','guest')),
  actor_id uuid,
  device_id uuid references devices(id) on delete set null,
  action text not null,                                  -- 'kot.void','bill.modify','bill.reprint','table.shift','discount.apply',...
  entity text not null,
  entity_id uuid not null,
  before jsonb, after jsonb,
  reason text,
  flagged boolean not null default false,                -- shows on the leakage panel
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on audit_log (outlet_id, created_at desc);
create index on audit_log (org_id, flagged, created_at desc);
create index on audit_log (entity, entity_id);
create index on audit_log (device_id);
-- Append-only: no one updates or deletes audit rows.
create or replace function app.audit_append_only() returns trigger
language plpgsql as $$ begin raise exception 'audit_log is append-only'; end $$;
create trigger audit_log_no_update before update or delete on audit_log
  for each row execute function app.audit_append_only();

-- ============================================================
-- Functions the server calls
-- ============================================================

-- Gap-free next number. Row lock serialises concurrent callers within one transaction.
create or replace function app.next_number(p_outlet uuid, p_kind text, p_series text, p_period text)
returns bigint language plpgsql as $$
declare v bigint; v_org uuid;
begin
  select org_id into v_org from outlets where id = p_outlet;
  insert into number_series (org_id, outlet_id, kind, series_code, period)
  values (v_org, p_outlet, p_kind, p_series, p_period)
  on conflict (outlet_id, kind, series_code, period) do nothing;

  update number_series set next_no = next_no + 1
   where outlet_id = p_outlet and kind = p_kind and series_code = p_series and period = p_period
  returning next_no - 1 into v;
  return v;
end $$;

-- Business date: before day_starts_at (default 05:00 local) still counts as yesterday.
create or replace function app.business_date(p_outlet uuid, p_at timestamptz default now())
returns date language sql stable as $$
  select ((p_at at time zone o.timezone) - o.day_starts_at::interval)::date
  from outlets o where o.id = p_outlet
$$;

-- Indian fiscal year label for a date: 2026-04-01..2027-03-31 -> '2026-27'.
create or replace function app.fiscal_year(p_date date) returns text
language sql immutable as $$
  select case when extract(month from p_date) >= 4
    then extract(year from p_date)::int || '-' || lpad(((extract(year from p_date)::int + 1) % 100)::text, 2, '0')
    else (extract(year from p_date)::int - 1) || '-' || lpad((extract(year from p_date)::int % 100)::text, 2, '0')
  end
$$;



-- ============================================================
-- Device pairing, background jobs, rate limits (server only)
-- ============================================================

create table pairing_codes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  code_hash text not null unique,
  kind text not null check (kind in ('pos','captain','kds','kiosk')),
  name text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by text references "user"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on pairing_codes (org_id);
create index on pairing_codes (outlet_id);
create index on pairing_codes (created_by);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payload jsonb not null default '{}',
  run_at timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued','running','done','dead')),
  attempts int not null default 0,
  max_attempts int not null default 5 check (max_attempts > 0),
  last_error text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_due on jobs (run_at) where status = 'queued';
create index on jobs (status, updated_at);

create table rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count int not null,
  updated_at timestamptz not null default now()
);

alter table jobs enable row level security;
alter table rate_limits enable row level security;

-- ============================================================
-- updated_at triggers + RLS on every table, generated
-- ============================================================

do $$
declare t record; has_outlet boolean; has_updated boolean;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = c.relname and column_name = 'org_id')
  loop
    select exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = t.relname and column_name = 'outlet_id')
      into has_outlet;
    select exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = t.relname and column_name = 'updated_at')
      into has_updated;

    if has_updated and t.relname <> 'audit_log' then
      execute format('create trigger %I before update on %I for each row execute function app.touch_updated_at()',
                     t.relname || '_touch', t.relname);
    end if;

    execute format('alter table %I enable row level security', t.relname);

    if t.relname in ('idempotency_keys','inbound_events','staff_sessions','staff_secrets','otp_challenges','pairing_codes') then
      continue;  -- server only: RLS on, no policy = no client access
    end if;

    if has_outlet then
      execute format($p$create policy tenant_read on %I for select to app_reader
                        using (org_id = app.org_id() and (outlet_id is null or app.can_outlet(outlet_id)))$p$, t.relname);
      execute format('grant select on %I to app_reader', t.relname);
    else
      execute format($p$create policy tenant_read on %I for select to app_reader
                        using (org_id = app.org_id())$p$, t.relname);
      execute format('grant select on %I to app_reader', t.relname);
    end if;
  end loop;
end $$;

grant select on stock_levels to app_reader;
create trigger jobs_touch before update on jobs for each row execute function app.touch_updated_at();
