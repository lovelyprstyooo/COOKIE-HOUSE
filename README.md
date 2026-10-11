# 🍪 CookieHouse Pro

Aplikasi manajemen bisnis cookies: produk & stok, pelanggan, penjualan, pengeluaran, dan laporan. Data tersimpan di Supabase.

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

## Cara pakai
1. Jalankan `backend/schema.sql` di Supabase SQL Editor.
2. (Opsional) ubah URL/key di bagian paling atas `frontend/js/app.js`.
3. Deploy ke GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / `(root)`**.
   Atau buka `frontend/index.html` langsung di browser.

## Catatan keamanan
Aplikasi belum memakai login, sehingga siapa pun yang membuka situsnya bisa melihat dan mengubah data. Tambahkan Supabase Auth sebelum dipakai untuk data bisnis sungguhan.
