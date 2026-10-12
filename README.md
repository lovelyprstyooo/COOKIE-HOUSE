# 🍪 CookieHouse Pro

Aplikasi manajemen bisnis cookies: produk & stok, pelanggan, penjualan, pengeluaran, dan laporan. Data tersimpan di Supabase.

🔗 **Demo:** [https://lovelyprstyooo.github.io/COOKIE-HOUSE/](https://lovelyprstyooo.github.io/COOKIE-HOUSE/)

---

## ✨ Fitur

- **Produk & Stok:** kelola daftar cookies, harga, dan jumlah stok. Stok berkurang otomatis saat ada penjualan (lewat trigger database).
- **Pelanggan:** simpan data pelanggan dan riwayat pembelian.
- **Penjualan:** catat transaksi penjualan dengan cepat.
- **Pengeluaran:** catat biaya operasional seperti bahan baku, kemasan, dan lainnya.
- **Laporan:** ringkasan penjualan, pengeluaran, dan keuntungan bisnis.

## 🛠️ Teknologi

| Bagian | Teknologi |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Database | Supabase (PostgreSQL) |
| Hosting | GitHub Pages |

## 📁 Struktur Proyek

```
├── backend/
│   └── schema.sql      # SQL Supabase (tabel, trigger stok, RLS, data contoh)
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js       # konfigurasi Supabase, koneksi data, logika & tampilan
├── index.html          # redirect ke frontend/ (untuk GitHub Pages)
└── README.md
```

## 🚀 Cara Menjalankan

### 1. Siapkan Supabase

1. Buat proyek baru di [supabase.com](https://supabase.com).
2. Buka **SQL Editor**, salin isi `backend/schema.sql`, lalu jalankan.
   File ini akan membuat tabel, trigger stok, aturan RLS (*Row Level Security*), dan data contoh.

### 2. Hubungkan Frontend ke Supabase

1. Di Supabase, buka **Project Settings → API**, lalu salin **Project URL** dan **anon public key**.
2. Buka `frontend/js/app.js` dan isi bagian konfigurasi Supabase di bagian atas file:

```js
const SUPABASE_URL = 'https://xxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'isi-dengan-anon-key-anda';
```

> ⚠️ Gunakan hanya **anon key**. Jangan pernah memasukkan `service_role` key ke kode frontend. Keamanan data diatur lewat RLS di `schema.sql`.

### 3. Jalankan

- **Lokal:** buka `frontend/index.html` di browser (atau gunakan ekstensi seperti Live Server di VS Code).
- **Online:** push ke GitHub, lalu aktifkan **Settings → Pages** dengan sumber branch `main` dan folder `/ (root)`. File `index.html` di root akan mengarahkan otomatis ke folder `frontend/`.

## 🗄️ Tentang Database

- **Trigger stok:** setiap penjualan tercatat, stok produk berkurang otomatis sehingga tidak perlu update manual.
- **RLS:** akses data dibatasi lewat kebijakan di `schema.sql`. Sesuaikan kebijakan ini jika aplikasi dipakai oleh banyak pengguna.
- **Data contoh:** disertakan agar aplikasi langsung terisi saat pertama dicoba. Hapus bagian ini dari `schema.sql` jika tidak diperlukan.

## 📌 Catatan

- Pastikan `schema.sql` dijalankan **sebelum** membuka aplikasi, jika tidak data tidak akan muncul.
- Jika data tidak tampil, periksa konsol browser (F12) untuk melihat pesan error koneksi Supabase.

## 📄 Lisensi

Proyek ini dibuat untuk keperluan pembelajaran dan pengelolaan usaha pribadi.
