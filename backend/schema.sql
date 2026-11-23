-- CookieHouse: skema Supabase. Jalankan di SQL Editor (sekali saja).

create table if not exists produk (
  id bigint generated always as identity primary key,
  nama text not null,
  kategori text not null default 'Lainnya',
  harga numeric not null check (harga >= 0),
  stok integer not null default 0 check (stok >= 0),
  min_stok integer not null default 5 check (min_stok >= 0),
  emoji text default '🍪'
);

create table if not exists pelanggan (
  id bigint generated always as identity primary key,
  nama text not null,
  hp text,
  email text,
  alamat text
);

create table if not exists penjualan (
  id bigint generated always as identity primary key,
  tanggal date not null,
  pelanggan_id bigint references pelanggan(id) on delete set null,
  produk_id bigint not null references produk(id) on delete restrict,
  qty integer not null check (qty > 0),
  harga numeric not null check (harga >= 0),
  total numeric generated always as (qty * harga) stored,
  metode text default 'Cash',
  catatan text
);

create table if not exists pengeluaran (
  id bigint generated always as identity primary key,
  tanggal date not null,
  keterangan text not null,
  kategori text not null,
  nominal numeric not null check (nominal > 0),
  metode text default 'Cash'
);

create index if not exists idx_penjualan_produk on penjualan(produk_id);
create index if not exists idx_penjualan_pelanggan on penjualan(pelanggan_id);

-- Stok berkurang otomatis saat penjualan dibuat, dikembalikan saat dihapus.
create or replace function ch_kurangi_stok() returns trigger
language plpgsql security definer set search_path = public as $$
declare s integer;
begin
  select stok into s from produk where id = new.produk_id for update;
  if s is null or s < new.qty then
    raise exception 'Stok tidak cukup (tersedia %)', coalesce(s,0);
  end if;
  update produk set stok = stok - new.qty where id = new.produk_id;
  return new;
end $$;

create or replace function ch_kembalikan_stok() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update produk set stok = stok + old.qty where id = old.produk_id;
  return old;
end $$;

drop trigger if exists trg_penjualan_insert on penjualan;
create trigger trg_penjualan_insert after insert on penjualan
  for each row execute function ch_kurangi_stok();

drop trigger if exists trg_penjualan_delete on penjualan;
create trigger trg_penjualan_delete after delete on penjualan
  for each row execute function ch_kembalikan_stok();

-- RLS aktif. Aplikasi belum memakai login, jadi anon diberi akses penuh.
-- Siapa pun yang punya URL + key bisa baca/ubah data; tambahkan Auth bila dipakai serius.
do $$
declare t text;
begin
  foreach t in array array['produk','pelanggan','penjualan','pengeluaran'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "anon_all" on %I', t);
    execute format('create policy "anon_all" on %I for all to anon using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on %I to anon', t);
  end loop;
end $$;
grant usage, select on all sequences in schema public to anon;
