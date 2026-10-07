# Ruanasa Space

Platform manajemen event wellness berbasis web (MVP: kelas yoga). Menggantikan proses manual lewat spreadsheet dan WhatsApp dengan satu sistem terintegrasi: peserta melihat event, mendaftar, dan membayar; admin mengelola event, peserta, pembayaran, kehadiran, dan feedback.

Bukan marketplace dan bukan media sosial.

## Fitur utama

**Peserta** (mobile-first, tanpa password)
- Login lewat Google, OTP email, OTP WhatsApp, atau lanjut tanpa login (akun dibuat otomatis).
- Daftar event untuk beberapa peserta sekaligus (multi-pax), add-on, dan kode promo.
- Pembayaran QRIS atau transfer bank lewat Midtrans, batas waktu 60 menit.
- Feedback setelah event melalui link unik.

**Admin** (desktop-first)
- Kelola event, template, instruktur, harga, bundle, add-on, dan kode promo.
- Pantau peserta, pembayaran, dan kehadiran; ekspor data; lihat analytics dan notifikasi.

## Arsitektur

Modular monolith, dua aplikasi terpisah yang berkomunikasi lewat REST API.

```
Next.js (Vercel)  →  REST /api/v1  →  NestJS (Render)  →  PostgreSQL (Supabase)
```

```
apps/web/          Frontend: Next.js 15, Tailwind CSS 3, shadcn/ui, TanStack Query, Zustand
apps/api/          Backend: NestJS 11, Prisma 6, JWT kustom
packages/shared/   Tipe dan skema bersama
docs/              Dokumen spesifikasi (PRD, SRD, ERD, API Spec, dst.) dan checklist milestone
```

Layanan eksternal: Midtrans, penyedia WhatsApp (Fonnte/Wablas), Resend, Google OAuth, Supabase Storage.

## Menjalankan secara lokal

Prasyarat: Node.js 22, Yarn 4 (lewat Corepack, `corepack enable`), dan database PostgreSQL 15+ (atau project Supabase).

```bash
yarn install
yarn build:shared

# Backend
cp apps/api/.env.example apps/api/.env.local     # isi DATABASE_URL, DIRECT_URL, JWT_SECRET, SEED_ADMIN_PASSWORD
yarn workspace @ruanasa/api prisma:deploy        # terapkan migrasi
yarn workspace @ruanasa/api prisma:seed          # data awal (admin, instruktur, event contoh)
yarn dev:api                                     # http://localhost:3001/api/v1/health

# Frontend
cp apps/web/.env.example apps/web/.env.local
yarn dev:web                                     # http://localhost:3000
```

Perintah lain: `yarn lint`, `yarn typecheck`, `yarn format:check`, `yarn test`, `yarn build`.

## Dokumentasi

Spesifikasi lengkap ada di [docs/](docs/). Urutan prioritas jika ada konflik: PRD → SRD → ERD → API Spec → UIUX Spec → TAD → DTBD. Aturan pengembangan ada di [CLAUDE.md](CLAUDE.md), dan progres per milestone di [docs/Ruanasa_Space_11_Milestones_Checklist.md](docs/Ruanasa_Space_11_Milestones_Checklist.md).

## Status

Dalam pengembangan. Fondasi proyek (Phase 0) dan database (Phase 1) selesai; berikutnya autentikasi (Phase 2).
