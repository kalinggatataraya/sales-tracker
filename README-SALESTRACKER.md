# Sales Tracker — Panduan Setup

Aplikasi **terpisah** dari RuteKirim. Read-only. Setiap sales **hanya** melihat pesanan miliknya sendiri — tanpa nilai penjualan, tanpa rute, tanpa data sales lain. Semua pembatasan dipaksakan di sisi server (bukan disembunyikan di tampilan).

Deploy sama seperti RuteKirim: **GitHub (web editor) → Vercel**. Tidak perlu CLI.

---

## 1. Buat repo & project baru

1. Buat repo GitHub baru, mis. `salestracker` (terpisah dari `rutekirim`).
2. Upload semua isi folder ini (`api/`, `src/`, `index.html`, `package.json`, `vite.config.js`) lewat GitHub web editor / drag-and-drop.
3. Di Vercel: **Add New → Project → Import** repo `salestracker`. Framework: **Vite** (terdeteksi otomatis). Deploy.

> Vercel otomatis menjadikan folder `api/` sebagai serverless function — sama seperti RuteKirim.

---

## 2. Isi Environment Variables di Vercel

Buka **Project → Settings → Environment Variables**. Tambahkan:

| Nama | Nilai |
|---|---|
| `ODOO_URL` | Sama seperti RuteKirim (mis. `https://xxx.odoo.com`) |
| `ODOO_DB` | Sama seperti RuteKirim |
| `ODOO_USER` | Sama seperti RuteKirim (boleh user read-only) |
| `ODOO_KEY` | Sama seperti RuteKirim (API key) |
| `SALES_REPS` | JSON daftar sales — lihat di bawah |
| `SALES_SLA_DAYS` | Angka target hari PO→Diterima. Lewat itu = **TELAT**. Default `7`. |

> **Cukup pakai user Odoo read-only.** Aplikasi ini tidak pernah menulis apa pun ke Odoo.

### Format `SALES_REPS`

Satu baris JSON berisi daftar sales. Setiap sales punya **token** (kode akses pribadi) dan cara memetakannya ke user Odoo — pilih salah satu: `email` (login Odoo), atau `uid` (ID user Odoo), atau `nama` (persis seperti di Odoo).

```json
[
  {"token":"pebri-9x2f","nama":"Pebrianto","email":"pebrianto@tataraya.com"},
  {"token":"eko-7k4d","nama":"Eko","email":"eko@tataraya.com"},
  {"token":"gloria-3m8p","nama":"Gloria Origita","uid":15}
]
```

Aturan:
- **`token`** — bebas, tapi buat sulit ditebak (mis. nama + 4 karakter acak). Ini kunci akses pribadi tiap sales.
- Pemetaan ke Odoo: paling andal pakai **`email`** (= login Odoo sales tsb) atau **`uid`**. `nama` dipakai hanya jika sama persis dengan nama user di Odoo.
- Ganti/hapus sales cukup dengan mengedit JSON ini, lalu **Redeploy**.

---

## 3. Bagikan link ke tiap sales

Setiap sales dapat link pribadi (buka sekali, tersimpan otomatis di HP-nya):

```
https://salestracker-xxx.vercel.app/?k=pebri-9x2f
https://salestracker-xxx.vercel.app/?k=eko-7k4d
```

Kirim via WhatsApp. Sales cukup buka link → langsung lihat pesanannya. Kalau ganti HP, mereka bisa masukkan kode aksesnya manual di layar login.

---

## 4. Yang dilihat sales (dan yang TIDAK)

**Dilihat:** nomor PO, PO customer, nama customer (miliknya), tahap pesanan, umur hari, status TELAT, tanggal jadwal kirim, rasio sebagian terkirim, tombol **"Salin update untuk customer"**.

**TIDAK pernah dilihat:** nilai penjualan, biaya/modal, rute pengiriman, pesanan/customer sales lain, KPI perusahaan.

---

## 5. Tahap pesanan

1. **PO Masuk** — PO dikonfirmasi di Odoo
2. **Diproses** — pesanan masuk antrean operasional
3. **Barang Disiapkan** — stok sudah dialokasikan gudang
4. **Dijadwalkan Kirim** — *(aktif setelah Fase 2, lihat di bawah)*
5. **Dalam Pengiriman** — barang sedang dikirim (dari `delivery_status` Odoo)
6. **Diterima Customer** — barang diterima penuh

Tahap 1–3, 5, 6 **sudah jalan hari ini** dari data Odoo yang ada. Tidak perlu ubah apa pun di Odoo untuk mulai.

---

## 6. (Opsional, nanti) Fase 2 — nyalakan "Dijadwalkan Kirim"

Tahap 4 muncul otomatis begitu RuteKirim menuliskan tanggal jadwal kirim ke Odoo. Langkahnya:

1. Di Odoo, buat custom field `x_scheduled_delivery` (tipe *Date*) di `sale.order` — via **Odoo Studio** (tanpa coding).
2. Tambahkan writeback di RuteKirim: saat order dijadwalkan ke armada, tulis tanggalnya ke `x_scheduled_delivery` (memakai jembatan Odoo yang sama seperti writeback tag GAGAL).

Sales Tracker sudah siap membaca field ini — begitu ada isinya, tahap 4 langsung menyala tanpa perubahan lagi di sisi Sales Tracker.

> Prasyarat penting: tetapkan dulu **target lead time (SLA)** agar "TELAT" bermakna. Sekarang dipakai `SALES_SLA_DAYS` (default 7 hari).
