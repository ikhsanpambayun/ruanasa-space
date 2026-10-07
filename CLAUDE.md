# CLAUDE.md — Ruanasa Space

## Project Overview

Ruanasa Space adalah web-based responsive wellness event management platform (MVP: Yoga Class). Bukan marketplace, bukan social media. Platform menggantikan proses manual (spreadsheet, WhatsApp) menjadi satu sistem terintegrasi.

## Architecture

**Modular Monolith** — dua aplikasi terpisah via REST API:

```
Frontend (Next.js 15+, Vercel) → REST API /api/v1 → Backend (NestJS 11+, Render) → PostgreSQL (Supabase)
```

Monorepo structure:
```
ruanasa-space/
  apps/web/          # Next.js frontend
  apps/api/          # NestJS backend
  packages/shared/   # Shared types, Zod schemas
```

## Tech Stack

**Frontend:** Next.js 15+ (App Router), TypeScript strict, Tailwind CSS 3+, shadcn/ui, TanStack Query v5, Zustand, React Hook Form v7+, Zod, lucide-react, recharts, date-fns, sonner, qrcode.react

**Backend:** NestJS 11+, Node.js 22 LTS, TypeScript strict, Prisma ORM 6+, Custom JWT (HS256, 7-day sliding), bcryptjs (12 rounds)

**Database:** PostgreSQL 15+ (Supabase), 17 tables, UUID PKs, soft delete (deleted_at)

**External:** Midtrans (QRIS + Bank Transfer), WhatsApp provider (Fonnte/Wablas), Resend (email), Google OAuth 2.0, Supabase Storage

## User Roles

- **Participant**: mobile-first, passwordless auth (Google OAuth, Email OTP, WhatsApp OTP, Continue Without Login)
- **Admin**: desktop-first dashboard, email + password login
- **User vs Participant**: User = buyer (punya akun), Participant = attendee. 1 User bisa daftar multiple Participants (multi-pax)
- **Identifikasi utama**: Phone number (PRIMARY), Email (SECONDARY). Keduanya UNIQUE.
- **Tidak ada guest tanpa akun** — continue without login tetap membuat akun (auto-create)

## Critical Business Rules

- Tidak ada cancellation/refund di MVP
- Payment expiration: 60 menit (deadline = registration created_at + 60 menit)
- Payment record dibuat saat user memilih metode pembayaran (POST /payments), BUKAN saat registrasi dibuat
- POST /payments boleh dipanggil ulang selama payment pending (ganti metode / coba lagi): transaksi gateway lama dibatalkan, baris payment yang sama di-update
- Midtrans order_id = {registration_id}-{unix_ts}, disimpan di payments.transaction_id
- Webhook untuk registrasi yang sudah expired: JANGAN confirm, log critical, balas 200 (refund manual di luar sistem)
- Registrasi expired TIDAK di-soft-delete dan tidak memblokir registrasi baru (user boleh daftar ulang)
- Discount stacking order: 1) Early Bird → 2) Bundle (% × pax_subtotal ATAU fixed × total_pax) → 3) Promo Code (after bundle, TIDAK termasuk add-on)
- Bundle fixed type: discount_value × total_pax (per-pax, bukan flat)
- Promo formula: applied on (pax_subtotal - bundle_discount), TIDAK termasuk add-on
- Total formula: (pax_subtotal - bundle_discount - promo_discount) + addon_subtotal
- Pricing calculation HANYA di backend — frontend menampilkan hasil API
- Slot counting: SUM(participants) WHERE registration_status IN ('pending', 'confirmed')
- Stock deduction (slot, add-on qty, promo quota) saat registration CREATED, restore saat expired
- Concurrent booking: database-level locking (SELECT FOR UPDATE)
- Attendance record dibuat saat payment CONFIRMED, bukan saat registration
- Feedback token di-generate saat payment CONFIRMED
- Feedback: rating NULLABLE (minimal salah satu field rating/comment/suggestion terisi), hanya untuk participant dengan status "present". "Sudah submit" = submitted_at NOT NULL; summary/analytics hanya menghitung baris yang sudah submit
- Payment status: pending_payment → paid | expired
- Unique registration constraint: partial unique index WHERE deleted_at IS NULL AND registration_status <> 'expired' (raw SQL migration, Prisma tidak support native)
- Auth rate limit: 10 req/min (bukan 5)
- Pagination response: { pagination: { page, per_page, total_items } } — TIDAK ada total_pages
- Post-event notification: dikirim saat event di-complete (asinkron); job harian hanya catch-up untuk status=completed + post_event_sent=false. Satu pesan WA per buyer berisi link feedback per participant yang present

## Backend Layer Pattern

```
Controller → Service → Repository
```

- **Controller**: receive request, validate DTO, auth/role guard, delegate to service, return response. TIDAK ada business logic.
- **Service**: business logic, pricing calc, registration, payment, notification, transaction.
- **Repository**: Prisma queries, transaction, soft delete filter. TIDAK ada business logic.
- **Adapters**: interface/adapter pattern untuk external services (Midtrans, WhatsApp, Email, Storage).

## Frontend Architecture

- **SSR**: public event listing, event detail (SEO)
- **CSR**: admin dashboard, registration wizard, payment, profile
- **State**: TanStack Query (API data), Zustand (client state — authStore, registrationStore, uiStore)
- **Design Reference**: Stitch AI design system → implemented with shadcn/ui + Tailwind CSS
- **PENTING**: Business-critical calculation TIDAK di frontend

## Authentication

Custom JWT — BUKAN Supabase Auth.

- Algorithm: HS256, Secret: env JWT_SECRET (min 256-bit), Expiry: 7 days sliding
- Payload: `{ sub: user_id, role: "admin"|"participant", iat, exp }`
- Delivery: httpOnly cookie (primary) + Authorization Bearer header (fallback). Backend support keduanya, prioritas cookie dahulu.
- OTP: 6 digit, 5 min expiry, max 5 attempts, rate limit 3 req/15 min, hashed SHA-256

## Naming Convention

**Backend:**
- Files: `{module}.module.ts`, `{module}.controller.ts`, `{module}.service.ts`, `{module}.repository.ts`, `{action}-{entity}.dto.ts`
- Variables/functions: camelCase | Classes: PascalCase | Constants: SCREAMING_SNAKE_CASE

**Frontend:**
- Components: `PascalCase.tsx` | Hooks: `use{Name}.ts` | Services: `{name}Service.ts` | Stores: `{name}Store.ts`

**Database:**
- Tables: snake_case plural | Columns: snake_case | Indexes: `idx_{table}_{column}`

**Git:**
- Branches: `feature/{module}-{feature}`, `fix/{module}-{desc}`, `hotfix/{desc}`
- Commits: `{type}({scope}): {description}` — types: feat, fix, refactor, test, docs, chore

## Code Style

- TypeScript strict mode — NO `any`, NO implicit types
- Semua function: JSDoc (description, @param, @returns)
- API response: `{ success, message, data }` atau `{ success: false, message, error_code, errors }`
- Date: stored UTC, displayed WIB (Asia/Jakarta)
- Soft delete: `WHERE deleted_at IS NULL` di semua query
- Error messages: user-facing Bahasa Indonesia, internal logs English
- Import order: external → internal → relative

## Prohibited Actions

AI TIDAK BOLEH tanpa approval:
- Mengubah database schema / ERD
- Mengubah API contract (endpoint, request/response format)
- Mengubah business rules (pricing, discount stacking, payment flow)
- Mengubah auth rules (JWT spec, OTP spec)
- Hardcode credentials di source code
- Menggunakan `any` type
- Menghapus test yang sudah passing
- Melakukan pricing calculation di frontend
- Hardcode warna (hex/rgb) di component — gunakan design tokens
- Membuat UI berbeda dari Stitch AI reference + UIUX Spec

AI BOLEH tanpa approval:
- Internal implementation detail (design patterns, code structure)
- Utility libraries (sesuai tech stack)
- Query optimization (tanpa ubah result)
- Error handling tambahan (tanpa ubah API contract)
- Menulis tests
- Refactor internal code (tanpa ubah external behavior)

## Design Rules

- Stitch AI = referensi visual utama (colors, typography, components)
- UIUX Spec v1.5 = referensi struktur halaman dan behavior
- Implementation: shadcn/ui + Tailwind CSS utility classes
- Design tokens via Tailwind config + CSS custom properties
- Responsive: mobile-first (participant), desktop-first (admin)
- Breakpoints: sm(640px), md(768px), lg(1024px), xl(1280px)
- Setiap halaman WAJIB: loading state (skeleton), empty state, error state

## Development Workflow

1. Baca REFERENCE documents di task DTBD
2. Pastikan dependency task sudah selesai
3. Jelaskan implementation plan sebelum coding
4. Implement sesuai coding standard
5. Tulis tests (unit + integration + edge case)
6. Jalankan validation checklist
7. Laporkan dengan Task Completion Report format

## Validation Checklist (Per Task)

- [ ] ERD aligned (schema, columns, constraints)
- [ ] API aligned (endpoint, method, request/response)
- [ ] Business rule fulfilled
- [ ] Error handling complete
- [ ] Security validated (auth guard, role guard, input validation)
- [ ] TypeScript strict (no any, no implicit types)
- [ ] Tests written and passing
- [ ] Design aligned (frontend — Stitch AI + UIUX Spec)

## Source of Truth Hierarchy

Jika ada konflik antar dokumen, prioritas:
1. PRD v1.5 (business requirement)
2. SRD v1.5 (system requirement)
3. ERD v1.6 (database structure)
4. API Spec v1.6 (API contract)
5. UIUX Spec v1.5 (interface design)
6. TAD v1.6 (architecture)
7. DTBD v1.6 (execution order)

Jika angka endpoint/contoh di dokumen lain berbeda, ikuti API Spec.

## Reference Documents

Lokasi file: folder `docs/` (pola nama `Ruanasa_Space_NN_<Dokumen>_v<versi>.txt`, NN = urutan 01–10; riwayat perubahan di `docs/Ruanasa_Space_00_CHANGELOG.txt`).

| Dokumen | Versi | Kapan Dirujuk |
|---------|-------|---------------|
| PRD | v1.5 | Business rules, user roles, scope |
| UFD | v1.5 | User journey, interaction flow |
| SRD | v1.5 | Validation rules, system constraints |
| ERD | v1.6 | Database schema, table/column detail |
| UIUX Spec | v1.5 | Page structure, design tokens, UI behavior |
| API Spec | v1.6 | Endpoint contract, request/response format (79 endpoints) |
| TAD | v1.6 | Architecture, tech stack, file structure |
| DTBD | v1.6 | Task execution (68 tasks, 12 phases) |
| Stitch AI Design Brief | v1.1 | Design system input |
| AI Dev Context Guide | v1.3 | Full development rules (baca untuk detail lengkap) |

## Development Phases (DTBD v1.6)

Phase 0: Foundation & Infrastructure → Phase 1: Database → Phase 2: Auth → Phase 3: Core Backend → Phase 4: Registration/Payment → Phase 5: Operations → Phase 6: Notification/Jobs → Phase 7: Frontend Foundation → Phase 8: Public Pages & Auth → Phase 9: Registration/Payment UI → Phase 10: Admin Dashboard → Phase 11: Testing → Phase 12: Deployment

**Kerjakan sequential sesuai phase dan dependency. Satu task per waktu.**
