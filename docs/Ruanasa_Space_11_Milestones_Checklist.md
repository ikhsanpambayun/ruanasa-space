# Ruanasa Space — Milestones & Checklist Pengembangan

Dokumen pelacak progres. Sumber urutan dan detail task: **DTBD v1.6** (68 task, 12 phase). Jika ada konflik, ikuti hierarki di CLAUDE.md (PRD → SRD → ERD → API Spec → UIUX → TAD → DTBD).

Aturan kerja: satu task aktif per waktu, sesuai dependency. Centang task hanya setelah **Definition of Done** (bagian 3) terpenuhi.

Terakhir diperbarui: 2026-10-06

---

## 1. Ringkasan Aplikasi

| Item | Keterangan |
|------|------------|
| Produk | Platform manajemen event wellness berbasis web (MVP: Yoga Class). Bukan marketplace, bukan social media. |
| Tujuan | Menggantikan proses manual (spreadsheet, WhatsApp) dengan satu sistem terintegrasi. |
| Arsitektur | Modular monolith: Next.js (Vercel) → REST `/api/v1` → NestJS (Render) → PostgreSQL (Supabase) |
| Monorepo | `apps/web`, `apps/api`, `packages/shared` (Yarn 4 workspaces) |
| Peran | **Participant** (mobile-first, passwordless) dan **Admin** (desktop-first, email + password) |
| Integrasi | Midtrans (QRIS + Bank Transfer), WhatsApp (Fonnte/Wablas), Resend, Google OAuth, Supabase Storage |
| Skala | 17 tabel, 79 endpoint, 18 modul backend |

### Alur utama

1. Participant melihat event (SSR) → login (Google / Email OTP / WhatsApp OTP / lanjut tanpa login).
2. Wizard registrasi 5 langkah → backend menghitung harga → registrasi dibuat (stok dipotong, deadline 60 menit).
3. Pilih metode bayar (`POST /payments`) → Midtrans → webhook mengonfirmasi.
4. Saat paid: attendance dan feedback token dibuat, notifikasi dikirim.
5. Event berlangsung → admin check-in → admin complete event → notifikasi post-event + link feedback.

### Aturan bisnis kritis (ringkas)

- Tidak ada cancellation/refund di MVP.
- Harga dihitung **hanya di backend**. Urutan: Early Bird → Bundle → Promo (promo tidak mengenai add-on).
- Total = (pax_subtotal − bundle − promo) + add-on.
- Slot dihitung dari registrasi `pending` + `confirmed`; stok dipotong saat registrasi dibuat, dikembalikan saat expired; pakai `SELECT FOR UPDATE`.
- Registrasi expired tidak di-soft-delete dan tidak memblokir pendaftaran ulang (partial unique index via raw SQL).
- Webhook untuk registrasi expired: jangan confirm, log critical, balas 200.
- Pagination: `{ page, per_page, total_items }` (tanpa `total_pages`).

---

## 2. Milestones

| Milestone | Phase | Kriteria selesai |
|-----------|-------|------------------|
| **M1 — Fondasi** | 0–1 | Monorepo, env, Prisma, 17 tabel termigrasi, seed berjalan |
| **M2 — Auth & Master Data** | 2–3 | Semua metode login berfungsi; CRUD event, instruktur, template, harga, add-on, diskon, upload |
| **M3 — Transaksi (inti bisnis)** | 4 | Pricing engine, registrasi, pembayaran Midtrans, expiration job teruji |
| **M4 — Backend Lengkap** | 5–6 | Operasi admin, notifikasi, job terjadwal, analytics |
| **M5 — Frontend Participant** | 7–9 | Halaman publik, auth, wizard, payment, profil, feedback |
| **M6 — Frontend Admin** | 10 | Dashboard dan seluruh halaman manajemen |
| **M7 — Teruji** | 11 | Unit, integrasi, dan E2E lulus |
| **M8 — Go-Live** | 12 | Deploy produksi, CI/CD, Supabase produksi |

Track backend (Phase 0–6) dan frontend (Phase 0, 7–10) boleh paralel setelah Phase 0, tetapi eksekusi tetap satu task per waktu. Phase 11–12 setelah keduanya selesai.

---

## 3. Definition of Done (per task)

- [ ] ERD selaras (schema, kolom, constraint)
- [ ] API selaras (endpoint, method, request/response)
- [ ] Aturan bisnis terpenuhi
- [ ] Error handling lengkap (pesan user Bahasa Indonesia)
- [ ] Keamanan tervalidasi (auth guard, role guard, validasi input)
- [ ] TypeScript strict (tanpa `any`), JSDoc di semua function
- [ ] Test ditulis dan lulus
- [ ] Desain selaras Stitch AI + UIUX Spec (frontend); ada loading, empty, dan error state
- [ ] Task Completion Report dibuat

---

## 4. Checklist Task

Legenda: `[ ]` belum · `[~]` sebagian (scaffold ada, belum diverifikasi terhadap acceptance criteria) · `[x]` selesai.

### M1 — Fondasi (Phase 0–1)

**Phase 0 — Foundation & Infrastructure**
- [x] P0-INF-001 Initialize Monorepo Structure *(diverifikasi 2026-10-06: install, lint, format, typecheck lulus; web :3000 dan api :3001 hidup; `@ruanasa/shared` dapat di-require dari kedua app)*
- [~] P0-INF-002 Setup Frontend Foundation *(2026-10-06: Tailwind 3 + token Stitch "Serene Hearth" dengan font Jost, shadcn Button/Input/Card, TanStack Query + devtools, 3 Zustand store, Axios interceptor, build/lint/typecheck lulus. Belum diuji runtime: devtools di browser dan redirect 401; tes ditulis di Phase 11)*
- [x] P0-INF-003 Setup Backend Foundation *(2026-10-06: prefix `/api/v1`, validasi env (Zod), CORS, rate limit 100/min + dekorator per tipe, filter error, interceptor transform/logging/timeout 30s, health, 18 folder modul. 10 unit + 11 e2e test lulus; server nyata diuji: health 200, CORS benar, startup gagal tanpa env)*
- [x] P0-INF-004 Setup Environment Variables *(2026-10-06: `.env.example` + `.env.local` untuk web dan api; `.env.local` ter-ignore; startup gagal bila DATABASE_URL/DIRECT_URL/JWT_SECRET kosong)*

**Phase 1 — Database**
- [x] P1-DB-001 Setup Prisma & Initial Connection *(2026-10-07: Prisma 6.19, PrismaService global; server connect ke Supabase lewat Transaction pooler 6543 (`pgbouncer=true`), migrasi lewat Session pooler 5432. `db pull` belum dijalankan terpisah, tetapi koneksi dan query terbukti)*
- [x] P1-DB-002 Create Full Database Schema *(2026-10-07: 2 migrasi diterapkan ke Supabase; 17 tabel; diuji dengan data nyata: duplikat registrasi aktif ditolak, expired/soft-deleted tidak memblokir daftar ulang, 8 CHECK diuji ditolak, rating NULL diterima. Dipakai `migrate deploy`, bukan `migrate dev`)*
- [x] P1-DB-003 Create Seed Data *(2026-10-07: seed berhasil dan idempoten (dijalankan 2x, jumlah baris tetap); admin bcrypt 12 rounds, password cocok dengan SEED_ADMIN_PASSWORD; login via API menunggu Phase 2)*

**Gerbang M1:** `yarn install --immutable`, `yarn build`, migrasi dan seed berhasil di database bersih.

### M2 — Auth & Master Data (Phase 2–3)

**Phase 2 — Auth**
- [ ] P2-BE-001 JWT Authentication Core
- [ ] P2-BE-002 Role-Based Authorization
- [ ] P2-BE-003 Google OAuth Login
- [ ] P2-BE-004 Email OTP Authentication
- [ ] P2-BE-005 WhatsApp OTP Authentication
- [ ] P2-BE-006 Auto Account Creation (Continue Without Login)
- [ ] P2-BE-007 Admin Login

**Phase 3 — Core Backend**
- [ ] P3-BE-001 User Profile API
- [ ] P3-BE-002 Event CRUD API (publish, complete, duplicate)
- [ ] P3-BE-003 Event Public API
- [ ] P3-BE-004 Instructor Management API
- [ ] P3-BE-005 Specialization Management API
- [ ] P3-BE-006 Event Template Management API
- [ ] P3-BE-007 Event Pricing Management API
- [ ] P3-BE-008 Add-on Management API
- [ ] P3-BE-009 Discount Code Management API
- [ ] P3-BE-010 File Upload API

**Gerbang M2:** semua metode login lolos; rate limit auth 10 req/menit; OTP 6 digit, 5 menit, maks 5 percobaan.

### M3 — Transaksi (Phase 4)

- [ ] P4-BE-001 Pricing Calculation Engine
- [ ] P4-BE-002 Registration Core Service
- [ ] P4-BE-003 Payment Integration (Midtrans)
- [ ] P4-BE-004 Payment Expiration Background Job

**Gerbang M3:** tes concurrent booking (tidak oversell), tes stacking diskon, webhook (paid, expired, transaksi tidak dikenal), ganti metode saat pending.

### M4 — Backend Lengkap (Phase 5–6)

**Phase 5 — Operations**
- [ ] P5-BE-001 Participant Management API
- [ ] P5-BE-002 Attendance Management API
- [ ] P5-BE-003 Feedback API
- [ ] P5-BE-004 Export API (CSV/XLSX)

**Phase 6 — Notification, Jobs, Analytics**
- [ ] P6-BE-001 Notification Service (WhatsApp + Email adapter)
- [ ] P6-BE-002 Admin In-App Notification API
- [ ] P6-BE-003 Event Reminder Background Job
- [ ] P6-BE-004 Post-Event Background Job
- [ ] P6-BE-005 Analytics API

**Gerbang M4:** seluruh 79 endpoint sesuai API Spec v1.6.

### M5 — Frontend Participant (Phase 7–9)

**Phase 7 — Foundation**
- [ ] P7-FE-001 Layout Components
- [ ] P7-FE-002 Shared UI Components
- [ ] P7-FE-003 API Client & Services
- [ ] P7-FE-004 TypeScript Types & Zod Schemas
- [ ] P7-FE-005 Frontend Middleware (Auth & Route Guard)

**Phase 8 — Public & Auth**
- [ ] P8-FE-001 Event Listing Page
- [ ] P8-FE-002 Event Detail Page
- [ ] P8-FE-003 Authentication Pages
- [ ] P8-FE-004 Error Pages

**Phase 9 — Registration, Payment, Profile**
- [ ] P9-FE-001 Registration Wizard (5-Step)
- [ ] P9-FE-002 Payment Page
- [ ] P9-FE-003 Confirmation Page
- [ ] P9-FE-004 Profile & Event History Page
- [ ] P9-FE-005 Feedback Form Page

**Gerbang M5:** alur peserta end-to-end di mobile; tidak ada perhitungan harga di frontend; tidak ada warna hardcode.

### M6 — Frontend Admin (Phase 10)

- [ ] P10-FE-001 Admin Dashboard Page
- [ ] P10-FE-002 Admin Event Management Pages
- [ ] P10-FE-003 Admin Template Management Pages
- [ ] P10-FE-004 Admin Instructor Management Pages
- [ ] P10-FE-005 Admin Specialization Management Page
- [ ] P10-FE-006 Admin Discount Management Pages
- [ ] P10-FE-007 Admin Participant & Payment Tabs
- [ ] P10-FE-008 Admin Attendance Tab
- [ ] P10-FE-009 Admin Feedback Tab
- [ ] P10-FE-010 Admin Notification UI
- [ ] P10-FE-011 Admin Analytics Detail Page

**Gerbang M6:** admin dapat menjalankan siklus penuh: buat event → publish → pantau pembayaran → check-in → complete.

### M7 — Teruji (Phase 11)

- [ ] P11-TEST-001 Backend Unit & Integration Tests
- [ ] P11-TEST-002 Frontend Component & E2E Tests

### M8 — Go-Live (Phase 12)

- [ ] P12-INF-001 Frontend Deployment (Vercel)
- [ ] P12-INF-002 Backend Deployment (Render)
- [ ] P12-INF-003 CI/CD Pipeline (GitHub Actions)
- [ ] P12-INF-004 Supabase Production Setup

---

## 5. Keputusan Terbuka (perlu persetujuan)

Dari CHANGELOG 2026-10-06, keputusan skema ini diterapkan di dokumen tetapi masih menunggu konfirmasi (aturan CLAUDE.md: perubahan schema/ERD butuh approval):

- [ ] K1 — `events.date`, `start_time`, `end_time` nullable; wajib terisi saat publish
- [ ] K2 — `updated_at` ditambahkan di `registrations` dan `payments`
- [ ] K3 — `registrations.subtotal` = pax_subtotal (tanpa add-on)
- [ ] K4 — `attendance_id` ditambahkan di respons participant list (API 15.1)

---

## 6. Catatan Progres

| Tanggal | Milestone | Catatan |
|---------|-----------|---------|
| 2026-10-06 | M1 | Dokumen spesifikasi dirapikan (CHANGELOG), tooling pindah ke Yarn 4, scaffold Next.js dan NestJS ada |
| 2026-10-06 | M1 | Phase 0 selesai (P0-INF-001 s.d. 004). P0-INF-002 masih `[~]` menunggu uji runtime frontend. Berikutnya: Phase 1 (database) |
| 2026-10-06 | M1 | Phase 1 ditulis penuh (schema, migrasi, seed, PrismaService) tapi belum dijalankan terhadap database: menunggu kredensial PostgreSQL. Gerbang M1 belum terpenuhi |
| 2026-10-07 | M1 | Phase 1 selesai dan terverifikasi di Supabase (21 pemeriksaan data nyata lulus). Gerbang M1 terpenuhi, kecuali catatan P0-INF-002 (uji runtime frontend). Berikutnya: Phase 2 (Auth) |
