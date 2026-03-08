-- =====================================================
-- market-pos v3 — วาง SQL นี้ใน Supabase SQL Editor แล้วกด Run
-- (ถ้าเคยรัน v2 แล้ว ให้ Drop ตาราง products, sales ก่อน หรือรัน DROP TABLE ด้านล่าง)
-- =====================================================

-- DROP ตารางเก่า (uncomment ถ้าต้องการ reset)
-- drop table if exists purchases cascade;
-- drop table if exists sales cascade;
-- drop table if exists products cascade;

-- ── ตารางสินค้า (dynamic — เพิ่ม/ลบได้เอง) ──────────────────
create table if not exists products (
  id           text primary key default gen_random_uuid()::text,
  name         text not null,
  cat          text not null,          -- chicken | thin | duck | century | salty | fish | custom
  emoji        text default '📦',
  color        text default '#64748B',
  bg           text default '#F1F5F9',
  price_unit   numeric default 0,      -- ราคาต่อฟอง/ถาด/ตัว
  price_pack10 numeric default 0,      -- ราคาถุง 10 (0 = ไม่มี)
  price_tray   numeric default 0,      -- ราคาแผง 30 (0 = ไม่มี)
  cost_unit    numeric default 0,      -- ต้นทุนต่อหน่วย (อัปเดตจาก purchases)
  sort_order   integer default 99,
  active       boolean default true,
  created_at   timestamptz default now()
);

-- ── ตารางบิลขาย ──────────────────────────────────────────────
create table if not exists sales (
  id          bigserial primary key,
  ts          timestamptz default now(),
  method      text,
  total       numeric default 0,
  total_cost  numeric default 0,
  profit      numeric default 0,
  items       jsonb
);

-- ── ตารางบันทึกการซื้อ (ต้นทุน) ──────────────────────────────
create table if not exists purchases (
  id           bigserial primary key,
  ts           timestamptz default now(),
  product_id   text references products(id) on delete set null,
  product_name text,
  qty_unit     numeric not null,        -- จำนวนหน่วย (ฟอง/ตัว/ถาด)
  qty_display  numeric,                 -- จำนวนที่แสดง (เช่น 10 แผง)
  unit_label   text,                    -- หน่วยที่แสดง เช่น "แผง"
  total_cost   numeric not null,        -- ราคาที่จ่ายทั้งหมด
  cost_per_unit numeric generated always as (total_cost / qty_unit) stored,
  note         text
);

create index if not exists sales_ts_idx     on sales(ts desc);
create index if not exists purchases_ts_idx on purchases(ts desc);

-- ── Row Level Security (public สำหรับร้านส่วนตัว) ───────────
alter table products  enable row level security;
alter table sales     enable row level security;
alter table purchases enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='products'  and policyname='allow all') then
    create policy "allow all" on products  for all using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where tablename='sales'     and policyname='allow all') then
    create policy "allow all" on sales     for all using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where tablename='purchases' and policyname='allow all') then
    create policy "allow all" on purchases for all using (true) with check (true); end if;
end $$;
