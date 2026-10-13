# Ruanasa Space — Milestones & Checklist Pengembangan

Dokumen pelacak progres. Sumber urutan dan detail task: **DTBD v1.6** (68 task, 12 phase). Jika ada konflik, ikuti hierarki di CLAUDE.md (PRD → SRD → ERD → API Spec → UIUX → TAD → DTBD).

Aturan kerja: satu task aktif per waktu, sesuai dependency. Centang task hanya setelah **Definition of Done** (bagian 3) terpenuhi.

Terakhir diperbarui: 2026-10-07

## Status Saat Ini

| Item | Keterangan |
|------|------------|
| Posisi | Phase 0 dan 1 selesai. Phase 2: kode selesai, 4 dari 7 task terbukti penuh dan 3 menunggu uji integrasi eksternal (Google, Resend, Fonnte). Phase 3 berjalan: 4 dari 10 task selesai (001, 004, 005, 009); berikutnya event, harga, add-on, template, API publik, upload. |
| Task | **14 selesai** · **4 sebagian** (menunggu kredensial atau uji runtime) · **50 belum** dari 68 |
| Repo | https://github.com/ikhsanpambayun/ruanasa-space |
| Git | `main` memuat Phase 0–2 (PR #1 sudah di-merge 2026-10-13). Phase 3 dikerjakan di branch `feature/core-master-data` |
| Tes (API) | 113 unit + 192 e2e lulus; lint, typecheck, format bersih. Tes frontend belum ada (Phase 11) |
| Database | Supabase, 2 migrasi terapkan, seed terisi (admin + data contoh) |

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

| Milestone | Phase | Kriteria selesai | Status |
|-----------|-------|------------------|--------|
| **M1 — Fondasi** | 0–1 | Monorepo, env, Prisma, 17 tabel termigrasi, seed berjalan | **Terpenuhi** (catatan: uji runtime frontend P0-INF-002 masih tertunda) |
| **M2 — Auth & Master Data** | 2–3 | Semua metode login berfungsi; CRUD event, instruktur, template, harga, add-on, diskon, upload | **Berjalan** — kode Phase 2 selesai (3 dari 7 task menunggu kredensial untuk uji integrasi), Phase 3 belum dimulai |
| **M3 — Transaksi (inti bisnis)** | 4 | Pricing engine, registrasi, pembayaran Midtrans, expiration job teruji | Belum mulai |
| **M4 — Backend Lengkap** | 5–6 | Operasi admin, notifikasi, job terjadwal, analytics | Belum mulai |
| **M5 — Frontend Participant** | 7–9 | Halaman publik, auth, wizard, payment, profil, feedback | Belum mulai |
| **M6 — Frontend Admin** | 10 | Dashboard dan seluruh halaman manajemen | Belum mulai |
| **M7 — Teruji** | 11 | Unit, integrasi, dan E2E lulus | Belum mulai |
| **M8 — Go-Live** | 12 | Deploy produksi, CI/CD, Supabase produksi | Belum mulai |

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

Legenda: `[ ]` belum · `[~]` sebagian (kode dan tes selesai, tetapi ada acceptance criteria yang belum bisa dibuktikan, misalnya butuh kredensial eksternal atau uji runtime) · `[x]` selesai dan terverifikasi.

### M1 — Fondasi (Phase 0–1)

**Phase 0 — Foundation & Infrastructure**
- [x] P0-INF-001 Initialize Monorepo Structure *(diverifikasi 2026-10-06: install, lint, format, typecheck lulus; web :3000 dan api :3001 hidup; `@ruanasa/shared` dapat di-require dari kedua app)*
- [~] P0-INF-002 Setup Frontend Foundation *(2026-10-06: Tailwind 3 + token Stitch "Serene Hearth" dengan font Jost, shadcn Button/Input/Card, TanStack Query + devtools, 3 Zustand store, Axios interceptor, build/lint/typecheck lulus. Belum diuji runtime: devtools di browser dan redirect 401; tes ditulis di Phase 11)*
- [x] P0-INF-003 Setup Backend Foundation *(2026-10-06: prefix `/api/v1`, validasi env (Zod), CORS, rate limit 100/min + dekorator per tipe, filter error, interceptor transform/logging/timeout 30s, health, 18 folder modul. 10 unit + 11 e2e test lulus; server nyata diuji: health 200, CORS benar, startup gagal tanpa env)*
- [x] P0-INF-004 Setup Environment Variables *(2026-10-06: `.env.example` + `.env.local` untuk web dan api; `.env.local` ter-ignore; startup gagal bila DATABASE_URL/DIRECT_URL/JWT_SECRET kosong)*

**Phase 1 — Database**
- [x] P1-DB-001 Setup Prisma & Initial Connection *(2026-10-07: Prisma 6.19, PrismaService global; server connect ke Supabase lewat Transaction pooler 6543 (`pgbouncer=true`), migrasi lewat Session pooler 5432. `db pull` belum dijalankan terpisah, tetapi koneksi dan query terbukti)*
- [x] P1-DB-002 Create Full Database Schema *(2026-10-07: 2 migrasi diterapkan ke Supabase; 17 tabel; diuji dengan data nyata: duplikat registrasi aktif ditolak, expired/soft-deleted tidak memblokir daftar ulang, 8 CHECK diuji ditolak, rating NULL diterima. Dipakai `migrate deploy`, bukan `migrate dev`)*
- [x] P1-DB-003 Create Seed Data *(2026-10-07: seed berhasil dan idempoten (dijalankan 2x, jumlah baris tetap); admin bcrypt 12 rounds, password cocok dengan SEED_ADMIN_PASSWORD; login admin via API terbukti di Phase 2)*

**Gerbang M1** (diperiksa ulang 2026-10-07):
- [x] `yarn install --immutable` lulus
- [x] `yarn lint`, `yarn typecheck`, `yarn format:check` bersih
- [x] Migrasi dan seed berhasil di database Supabase baru
- [x] `yarn build` dari root lulus (diperiksa ulang 2026-10-13 di `main` setelah merge PR #1, tanpa server dev berjalan)

### M2 — Auth & Master Data (Phase 2–3)

**Phase 2 — Auth**
- [x] P2-BE-001 JWT Authentication Core *(2026-10-07: HS256, payload `{sub, role, iat, exp}`, 7 hari, cookie httpOnly + Bearer (cookie diprioritaskan), sliding window, blacklist logout. Diuji: token kedaluwarsa, tanda tangan palsu, `alg: none`, temp_token sebagai token akses)*
- [x] P2-BE-002 Role-Based Authorization *(2026-10-07: guard JWT global secure-by-default (`@Public()` untuk membuka), `@Roles`, role dibaca ulang dari database)*
- [~] P2-BE-003 Google OAuth Login *(2026-10-07: logika, temp_token, account linking diuji; verifier asli menolak token palsu. Belum diuji dengan ID token Google sungguhan: butuh GOOGLE_CLIENT_ID dan login dari frontend)*
- [~] P2-BE-004 Email OTP Authentication *(2026-10-07: seluruh aturan OTP diuji, termasuk di Supabase dengan adapter console. Pengiriman nyata via Resend belum diuji: butuh EMAIL_API_KEY dan domain terverifikasi)*
- [~] P2-BE-005 WhatsApp OTP Authentication *(2026-10-07: sama dengan Email OTP. Pengiriman nyata via Fonnte belum diuji: butuh WHATSAPP_API_KEY dan device aktif)*
- [x] P2-BE-006 Auto Account Creation (Continue Without Login) *(2026-10-07: diuji di Supabase termasuk pendaftaran serentak dengan nomor sama)*
- [x] P2-BE-007 Admin Login *(2026-10-07: diuji dengan akun seed di Supabase)*

**Phase 3 — Core Backend**
- [x] P3-BE-001 User Profile API *(2026-10-13: GET/PUT /users/profile, GET /users/event-history; khusus participant. Event history = registrasi confirmed (termasuk event mendatang) dengan status kehadiran peserta milik user; field profil terbatas pada name/email/phone sehingga role tidak bisa diubah. Diuji dengan data nyata di Supabase)*
- [ ] P3-BE-002 Event CRUD API (publish, complete, duplicate)
- [ ] P3-BE-003 Event Public API
- [x] P3-BE-004 Instructor Management API *(2026-10-13: 6 endpoint, mapping specialization diganti atomik. Hapus diblokir 403 INSTRUCTOR_HAS_ACTIVE_EVENT bila masih ada event apa pun; template yang merujuk dilepas. Diuji di Supabase)*
- [x] P3-BE-005 Specialization Management API *(2026-10-13: 4 endpoint, nama unik tanpa membedakan huruf besar/kecil. Diuji di Supabase)*
- [ ] P3-BE-006 Event Template Management API
- [ ] P3-BE-007 Event Pricing Management API
- [ ] P3-BE-008 Add-on Management API
- [x] P3-BE-009 Discount Code Management API *(2026-10-13: list/create/update admin + validate peserta (dibatasi 20/menit). Diuji di Supabase termasuk tanggal kedaluwarsa dan semua kode error promo)*
- [ ] P3-BE-010 File Upload API

**Gerbang M2:**
- [~] Semua metode login lolos: admin, auto-create, OTP email/WhatsApp (adapter console), dan Google (verifier + logika) terbukti; pengiriman nyata (Resend, Fonnte) dan ID token Google asli belum
- [x] Rate limit auth 10 req/menit (e2e) dan auto-create 5 req/menit
- [x] OTP 6 digit, 5 menit, maks 5 percobaan, 3 request per 15 menit
- [ ] CRUD event, instruktur, template, harga, add-on, diskon, dan upload (Phase 3): instruktur, specialization, dan diskon selesai; event, template, harga, add-on, dan upload belum

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

## 5. Keputusan yang Perlu Persetujuan

CLAUDE.md mewajibkan persetujuan untuk perubahan schema/ERD, API contract, dan aturan bisnis. Daftar di bawah mencatat keputusan yang sudah **diterapkan di kode** tetapi belum dikonfirmasi pemilik produk. Centang setelah disetujui (atau ubah bila tidak sesuai).

### 5.1 Keputusan skema dari CHANGELOG 2026-10-06

- [ ] K1 — `events.date`, `start_time`, `end_time` nullable; wajib terisi saat publish. *Status: sudah di schema dan terbukti di database; validasi saat publish dikerjakan di P3-BE-002.*
- [ ] K2 — `updated_at` di `registrations` dan `payments`. *Status: sudah di schema.*
- [ ] K3 — `registrations.subtotal` = pax_subtotal (tanpa add-on). *Status: dicatat di schema; dipakai di Phase 4.*
- [ ] K4 — `attendance_id` di respons participant list (API 15.1). *Status: belum; dikerjakan di P5-BE-001.*

### 5.2 Keputusan implementasi Phase 0–2

| # | Keputusan | Alasan | Status |
|---|-----------|--------|--------|
| D1 | Font **Jost** menggantikan Plus Jakarta Sans (Stitch) | Keputusan pemilik produk (2026-10-06) | Disetujui; **dokumen UIUX Spec 3.2 dan Stitch Brief belum diperbarui** |
| D2 | Skala neutral diturunkan dari token surface/outline Stitch; skala shade primary tidak lengkap | Stitch hanya memberi satu hex per peran | [ ] |
| D3 | Kolom TIMESTAMP diimplementasikan sebagai `timestamptz(6)` | Perbandingan dengan `NOW()` (expiration job) benar di zona waktu mana pun | [ ] |
| D4 | Relasi participant → attendance/feedback dimodelkan one-to-many di Prisma | Prisma menolak 1:1 tanpa unique tunggal; struktur DB tetap sesuai ERD | [ ] |
| D5 | `ON DELETE`: `events.template_id` SET NULL; FK lain yang tidak disebut ERD RESTRICT | ERD hanya menyebut CASCADE untuk sebagian FK | [ ] |
| D6 | Kode error fallback `NOT_FOUND` untuk route tak dikenal | Tidak ada kode generik di API Spec 22 | [ ] |
| D7 | Header response `X-Refreshed-Token` + `Access-Control-Expose-Headers` untuk sliding window klien Bearer | AC P2-BE-001 meminta token baru di tiap request | [ ] |
| D8 | Sesi OTP dan blacklist token **in-memory** (di balik interface, bisa diganti Redis) | ERD tidak punya tabel OTP; data hilang saat restart dan tidak cocok multi-instance | [ ] |
| D9 | `google-auth-library` menggantikan `passport-google-oauth20` | Alur memverifikasi `id_token` dari frontend, bukan redirect OAuth | [ ] |
| D10 | Cookie sesi `Secure` aktif di luar development/test | Safari menolak cookie Secure di http://localhost | [ ] |
| D11 | Schema Prisma di `src/database/prisma/` (TAD 6.1), bukan `prisma/` (DTBD) | TAD lebih tinggi di hierarki dokumen | [ ] |
| D12 | Migrasi diterapkan dengan `migrate deploy`, bukan `migrate dev` | `migrate dev` butuh shadow database yang sering bermasalah di Supabase | [ ] |
| D13 | Hapus instruktur diblokir (403 `INSTRUCTOR_HAS_ACTIVE_EVENT`) bila ada event apa pun yang merujuk, termasuk event completed/soft-deleted; pesannya dibedakan | Foreign key RESTRICT dan riwayat event harus utuh; ERD/API hanya menyebut event published/aktif | [ ] |
| D14 | `POST /discount-codes/validate` dibatasi 20 request/menit | Mencegah tebak-tebakan kode promo; tidak ada di daftar rate limit TAD 8.7 | [ ] |
| D15 | Kode promo: tanggal kedaluwarsa saat dibuat harus setelah hari ini (WIB); berlaku sampai akhir tanggal itu; kode tidak bisa diubah; kuota tidak boleh di bawah pemakaian; update tanpa `status` mempertahankan status lama | API Spec tidak merinci body update dan batas tanggal | [ ] |
| D16 | `PUT` instruktur mengganti seluruh data (field opsional yang tidak dikirim di-reset, `status` dipertahankan); ID path yang bukan UUID dijawab 404 `NOT_FOUND` | Semantik PUT; kode `NOT_FOUND` dipakai untuk entitas tanpa kode khusus (perluasan D6) | [ ] |

Koreksi kepatuhan (bukan keputusan baru): validasi DTO sekarang HTTP **422** sesuai API Spec (sebelumnya 400 di Phase 0).

---

## 6. Tindak Lanjut & Hutang Teknis

**Kredensial yang dibutuhkan untuk menutup task `[~]`**
- [ ] Google: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (P2-BE-003)
- [ ] Resend: `EMAIL_API_KEY` + domain pengirim terverifikasi (P2-BE-004)
- [ ] Fonnte: `WHATSAPP_API_KEY` + device aktif (P2-BE-005)
- [ ] Midtrans sandbox (Phase 4) dan Supabase Storage (P3-BE-010)

**Keamanan**
- [ ] Rotate API key Stitch (sempat dibagikan lewat chat); set ulang `STITCH_API_KEY`
- [ ] Ganti password database / admin seed sebelum staging dan production

**Perbaikan terjadwal**
- [ ] Interceptor Axios: bedakan 401 sesi habis (`UNAUTHORIZED`) dari 401 gagal login (`AUTH_FAILED`) — P7-FE-003
- [ ] CORS terpisah untuk `/payments/webhook` — P4-BE-003
- [ ] Ganti penyimpanan OTP/blacklist ke Redis sebelum menjalankan lebih dari satu instance — P12-INF-002
- [ ] Jadikan skrip verifikasi database (saat ini di luar repo) sebagai test integrasi permanen — P11-TEST-001
- [ ] Uji runtime frontend (devtools, redirect 401, store) — P11-TEST-002
- [ ] Cek path template di API Spec saat P3-BE-006 (TAD 6.1 menulis `/admin/event-templates`)
- [ ] Perbarui dokumen spesifikasi: font Jost, header `X-Refreshed-Token` (API Spec 2.3)
- [ ] `prisma db pull` belum dijalankan terpisah (koneksi dan query sudah terbukti)

**Lingkungan**
- Yarn global di mesin ini masih 1.22; pakai `corepack yarn ...` atau jalankan `corepack enable`.
- Paket `@nestjs/config`, `@nestjs/jwt`, `@nestjs/passport` dipakai versi CommonJS (4 / 11 / 11) karena versi terbaru ESM-only dan tidak kompatibel dengan Jest.

---

## 7. Catatan Progres

| Tanggal | Milestone | Catatan |
|---------|-----------|---------|
| 2026-10-06 | M1 | Dokumen spesifikasi dirapikan (CHANGELOG), tooling pindah ke Yarn 4, scaffold Next.js dan NestJS ada |
| 2026-10-06 | M1 | Phase 0 selesai (P0-INF-001 s.d. 004). P0-INF-002 masih `[~]` menunggu uji runtime frontend |
| 2026-10-07 | M1 | Phase 1 selesai dan terverifikasi di Supabase (21 pemeriksaan data nyata lulus). Gerbang M1 terpenuhi |
| 2026-10-07 | — | Repo di-push ke GitHub (`main` = commit awal Phase 0–1) |
| 2026-10-07 | M2 | Kode Phase 2 selesai di branch `feature/auth-authentication` (113 unit + 70 e2e test; 33 pemeriksaan di Supabase). 4 task terbukti penuh; 3 task `[~]` (Google, Email OTP, WhatsApp OTP) menunggu kredensial Google, Resend, Fonnte untuk uji integrasi. Branch di-push; PR belum dibuat |
| 2026-10-07 | M2 | Checklist diperiksa ulang terhadap kondisi nyata: 10 selesai, 4 sebagian, 54 belum. `yarn build` root belum bisa diulang karena server dev sedang berjalan |
| 2026-10-13 | M2 | PR #1 (Phase 2) di-merge ke `main`. Gerbang build M1 ditutup (`yarn build` root lulus). Phase 3 dimulai di branch `feature/core-master-data` |
| 2026-10-13 | M2 | Phase 3 (bagian 1) di branch `feature/core-master-data`: profil user, specialization, instruktur, kode diskon. 113 unit + 192 e2e lulus; 52 pemeriksaan di Supabase. Belum di-push/PR |
