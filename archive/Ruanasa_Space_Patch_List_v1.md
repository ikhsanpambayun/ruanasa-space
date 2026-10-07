# Ruanasa Space — Patch List (ERD 1.5 → 1.6 dan dokumen turunannya)

Dasar: ERD v1.5, API Spec v1.5, TAD v1.5, DTBD v1.5, SRD v1.4, UIUX v1.4, UFD v1.4, PRD v1.4, AI Guide v1.2.
Urutan kerja: ERD → API Spec → TAD → DTBD → SRD/PRD/UFD/UIUX → AI Guide.

## Keputusan yang dipakai di patch ini (setujui atau ubah dulu)

| # | Keputusan | Alasan |
|---|-----------|--------|
| D1 | Unique registrasi = partial index `WHERE deleted_at IS NULL AND registration_status <> 'expired'`. Registrasi expired TIDAK di-soft-delete. | Memungkinkan "Daftar Ulang"; analytics dan daftar expired tetap utuh. |
| D2 | Tambah `GET /admin/events/{event_id}/payments`. `GET /registrations/{id}` mengembalikan objek `payment`. Total endpoint 78 → 79. | Payments tab admin dan reload halaman payment butuh data ini. |
| D3 | `POST /payments` boleh dipanggil ulang selama payment masih `pending_payment`: transaksi gateway lama dibatalkan, baris payment yang sama di-update (metode, transaction_id, amount). UNIQUE `registration_id` tetap, tidak ada perubahan skema. | Mengizinkan ganti metode dan "Coba Lagi". |
| D4 | Order ID Midtrans = `{registration_id}-{unix_ts}`, disimpan di `payments.transaction_id`. Webhook mencari payment lewat `transaction_id` (sudah ter-index). Midtrans `custom_expiry` = sisa waktu sampai `payment_deadline`. | Midtrans menolak order_id yang dipakai ulang. |
| D5 | Webhook untuk registrasi yang sudah `expired`: jangan confirm, tulis log level critical, balas 200. Refund ditangani manual di luar sistem (MVP tanpa refund). | Mencegah double-booking slot yang sudah terjual. |
| D6 | Feedback: rating opsional di semua dokumen (minimal salah satu field terisi). "Sudah submit" = `submitted_at IS NOT NULL`. Admin summary dan analytics hanya menghitung baris yang sudah submit. | Selaras dengan ERD v1.5. |
| D7 | Post-event: dikirim saat event di-complete (asinkron). Job harian hanya catch-up untuk `status='completed' AND post_event_sent=false` (tanpa filter "hari ini"). Satu pesan WA ke buyer berisi link feedback per participant yang `present`. | Menutup celah event yang di-complete setelah jam job. |

---

## 1. ERD v1.5 → v1.6

**§9 Registrations — Indexes**
- Sebelum: `UNIQUE (event_id, buyer_user_id) WHERE deleted_at IS NULL — partial unique index, ...`
- Sesudah: `UNIQUE (event_id, buyer_user_id) WHERE deleted_at IS NULL AND registration_status <> 'expired' — partial unique index. Hanya registrasi aktif (pending/confirmed) yang diblokir. Registrasi expired tidak di-soft-delete dan tidak memblokir registrasi baru. Implementasi via raw SQL migration (Prisma tidak mendukung partial unique native).`

**§22.1 Unique Constraints**
- Sebelum: `(registrations) event_id + buyer_user_id — satu user satu registrasi per event.`
- Sesudah: `(registrations) event_id + buyer_user_id (partial: registrasi aktif, bukan expired, bukan soft-deleted) — satu user satu registrasi aktif per event.`

**§21.6 Soft Delete**
- Sebelum: `registrations — registrasi yang expired.`
- Sesudah: `registrations — hanya untuk koreksi/cleanup oleh admin. Registrasi expired TIDAK di-soft-delete.`

**§11 Payments — Notes (ganti poin kedua dan ketiga)**
- Sesudah:
  - `Payment record dibuat saat user pertama kali memilih metode pembayaran.`
  - `Selama status masih pending_payment, POST /payments boleh dipanggil ulang: baris payment yang sama di-update (payment_method, transaction_id, amount). UNIQUE registration_id tidak berubah.`
  - `transaction_id menyimpan order_id Midtrans dengan format {registration_id}-{unix_ts}.`

**§18 Feedback — Rules (tambahkan)**
- `Baris feedback dibuat untuk setiap participant saat payment confirmed (rating/comment/suggestion NULL, submitted_at NULL). Participant dianggap sudah submit jika submitted_at IS NOT NULL.`
- `Perhitungan average rating, total feedback, dan distribusi hanya memakai baris dengan submitted_at IS NOT NULL.`

---

## 2. API Spec v1.5 → v1.6

**§6.7 Complete Event — Rules**
- Sesudah: `Hanya published yang bisa dicomplete. Triggers: kirim post-event notification (asinkron) ke buyer, berisi link feedback per participant yang present. Feedback token sudah dibuat saat payment confirmed.`

**§6.10 Send Post-Event — Error 403**
- Sebelum: `"Event belum completed" / error_code: "INVALID_STATUS"`
- Sesudah: `"Event belum completed" / error_code: "INVALID_STATUS_TRANSITION"`

**§13.1 Calculate Price — Discount Stacking Order, poin 2**
- Sebelum: `Bundle → percentage discount × pax_subtotal (hanya pax, tidak termasuk add-on)`
- Sesudah: `Bundle → percentage: pax_subtotal × value/100; fixed_amount: value × total_pax (hanya pax, tidak termasuk add-on)`

**§13.2 Create Registration — contoh respons**
- `"discount_amount": 109750` → `105750`
- `"total_payment": 380250` → `384250`

**§13.3 Get Registration Detail — tambahkan objek `payment`**
```
"payment": {
  "payment_id": "uuid|null",
  "payment_method": "qris|bank_transfer|null",
  "status": "pending_payment|paid|expired|null",
  "payment_data": { "qr_code_url": "string|null", "va_number": "string|null", "bank_name": "string|null" },
  "expires_at": "timestamp|null"
}
```
Catatan: semua field `null` jika user belum memilih metode.

**§14.1 Create Payment**
- Contoh respons `"amount": 380250` → `384250`.
- Tambahkan Deskripsi: `Jika registrasi sudah punya payment berstatus pending_payment, transaksi gateway lama dibatalkan dan payment yang sama di-update dengan metode/transaksi baru. Jika sudah paid → ALREADY_PAID. Jika registrasi expired → REGISTRATION_EXPIRED.`

**§14.3 Webhook — tambahkan langkah**
- Sebelum langkah 5, sisipkan: `Jika registrasi sudah expired: jangan proses, catat log critical, balas 200.`
- Setelah attendance, tambahkan: `Buat baris feedback (token unik) untuk setiap participant.`
- Renumber langkah.

**§14.4 Manual Check — status**
- Sebelum: `"status": "pending_payment|paid"`
- Sesudah: `"status": "pending_payment|paid|expired"`

**§14.5 BARU — Get Event Payments (Admin)**
```
GET /admin/events/{event_id}/payments
Auth: Required (admin)
Query: ?page=1&per_page=20&payment_status=pending_payment|paid|expired

Response 200:
{
  "success": true,
  "data": [
    {
      "payment_id": "uuid|null",
      "registration_id": "uuid",
      "booking_owner": "string",
      "total_pax": 3,
      "total_payment": 384250,
      "payment_method": "qris|bank_transfer|null",
      "payment_status": "pending_payment|paid|expired",
      "payment_deadline": "timestamp",
      "paid_at": "timestamp|null"
    }
  ],
  "pagination": { ... }
}
```

**§17.1 / §17.2** — tidak ada perubahan kontrak. Tambahkan catatan di 17.2: `Rating opsional. already_submitted = (submitted_at IS NOT NULL).`

**§17.3 Get Event Feedback (Admin)**
- Tambahkan: `Hanya feedback dengan submitted_at IS NOT NULL yang masuk summary dan list.`
- Field item `"created_at"` → `"submitted_at"`.
- `average_rating` dihitung dari baris yang rating-nya tidak NULL.

**§22 Error Code Reference — tambahkan**
```
EMPTY_FEEDBACK           Minimal satu field feedback harus diisi
ATTENDANCE_NOT_FOUND     Attendance record tidak ditemukan
```

**§23.2 Payment Expiration Job — Actions**
- Tambahkan: `Registrasi TIDAK di-soft-delete (deleted_at tetap NULL).`

**§23.4 Post Event Notification**
- Sesudah: `Trigger: otomatis saat event di-complete (asinkron); job harian hanya catch-up untuk event completed dengan post_event_sent = false; admin bisa trigger manual via POST /admin/events/{id}/send-post-event. Satu pesan WA ke setiap buyer confirmed, berisi link feedback untuk setiap participant miliknya yang attendance = present. Set events.post_event_sent = true setelah selesai.`

**§24 Endpoint Summary**
- Payment (4) → Payment (5): tambahkan `GET /admin/events/{event_id}/payments`.
- `Total: 78 endpoints` → `Total: 79 endpoints`.

---

## 3. TAD v1.5 → v1.6

- **§4.15 dan §14.3 (Idempotency key):** `Idempotency: order_id = registration_id` → `order_id = {registration_id}-{unix_ts}, disimpan di payments.transaction_id; custom_expiry Midtrans = sisa waktu sampai payment_deadline`.
- **§5.2 Admin Routes:** `/admin/event-templates*` → `/admin/templates*` (selaras dengan §5.1 dan DTBD).
- **§6.3 poin 6 dan §11.1 Webhook:** tambahkan langkah `Guard: jika registration_status = expired → jangan proses, log critical, balas 200` dan `Create feedback record + token untuk setiap participant`. Samakan jumlah langkah dengan DTBD P4-BE-003 dan sebut "11 actions".
- **§7.2 poin 5 dan §7.4 registrations:**
  - Sebelum: `registrations: event_id + buyer_user_id (UNIQUE)` / `UNIQUE INDEX on (event_id, buyer_user_id)`
  - Sesudah: `registrations: event_id + buyer_user_id (UNIQUE parsial: WHERE deleted_at IS NULL AND registration_status <> 'expired', via raw SQL migration)`
- **§8.4:** `Event Admin: 9` → `10`; `Notification: 4` → `5`; `Payment: 4` → `5`; `Total: 55` → `Total: 79`. **§27:** `55 endpoints` → `79 endpoints`. **§8.1** sudah 78 → `79`.
- **§9.1:** setelah `POST /payments` tambahkan `(boleh dipanggil ulang selama pending untuk ganti metode)`.
- **§11.2 Expiration:** tambahkan `Registrasi expired tidak di-soft-delete.`
- **§12.1 poin 3 dan §13.3 PostEventJob:**
  - Query: `status = 'completed' AND post_event_sent = FALSE` (hapus `completed_at IS TODAY`).
  - Pengiriman utama dipicu saat complete; job hanya catch-up.
  - Langkah a/b: `satu pesan per buyer berisi link feedback untuk setiap participant present`.

---

## 4. DTBD v1.5 → v1.6

- **P0-INF-003:** `auth 5/min` → `auth 10/min`; AC `6 request ... → 429` → `11 request ke auth endpoint dalam 1 menit → 429`. Referensi `TAD Section 7.3` (CORS) → `Section 8.6`.
- **P1-DB-002 — Output/AC:** tambahkan `Raw SQL migration: CREATE UNIQUE INDEX ... ON registrations (event_id, buyer_user_id) WHERE deleted_at IS NULL AND registration_status <> 'expired'` dan AC `Registrasi expired tidak memblokir registrasi baru untuk event yang sama`.
- **P3-BE-002:** Reference `6.1-6.9` → `6.1-6.10`; Output tambahkan `POST /admin/events/:id/send-post-event (completed only)`.
- **P3-BE-010:** Reference `6.10` → `6.11`.
- **P4-BE-002 langkah 3:** `Check duplicate: registrasi aktif (bukan expired, bukan soft-deleted) untuk buyer_user_id + event_id → 409 DUPLICATE_REGISTRATION`.
- **P4-BE-003:**
  - Payment Creation: ganti `order_id = registration_id (idempotency)` dengan `order_id = {registration_id}-{unix_ts}, disimpan di payments.transaction_id; custom_expiry = sisa waktu payment_deadline`. Tambahkan `Jika payment pending sudah ada: batalkan transaksi lama, update baris yang sama`.
  - Webhook langkah 7: `Generate feedback record + token ...` → `Buat baris feedback (token unik, tanpa expiry) untuk setiap participant. Tabel feedback, bukan feedback_tokens.`
  - Webhook langkah 1.5 baru: `Jika registrasi expired → jangan proses, log critical, balas 200.`
  - Output tambahkan `GET /admin/events/:event_id/payments`. Reference tambahkan `API Spec Section 14.5`.
  - AC tambahkan: `Ganti metode pada payment pending berhasil`, `Webhook untuk registrasi expired tidak mengubah status`, `Admin payments list mengembalikan metode, deadline, paid_at`.
- **P4-BE-004:** tambahkan `Registrasi TIDAK di-soft-delete`.
- **P5-BE-003 AC:** tambahkan `Admin list dan summary hanya menghitung submitted_at NOT NULL; average rating dari rating NOT NULL`.
- **P5-BE-004:** Reference `Section 19` → `Section 20`.
- **P6-BE-004:** Query tanpa filter hari; tambahkan Output `POST /admin/events/:id/send-post-event`; Process: `satu pesan per buyer berisi link feedback per participant present`; AC tambahkan `Event yang di-complete setelah jam job tetap diproses`.
- **P6-BE-005:** Reference `Section 20` → `Section 19`; AC `Feedback rating = average dari feedback yang sudah submit (submitted_at NOT NULL, rating NOT NULL)`.
- **P7-FE-003:** `exportService (download CSV)` → `(download CSV/XLSX)`.
- **P9-FE-002:** halaman payment membaca `payment` dari `GET /registrations/:id` saat reload; state "Failed" = error `PAYMENT_GATEWAY_ERROR` dari `POST /payments`; "Coba Lagi" dan ganti metode memanggil ulang `POST /payments`.
- **P9-FE-005 AC:** `Star rating: ..., wajib` → `Star rating: 5 bintang, opsional; minimal salah satu field (rating/comment/suggestion) harus diisi`.
- **P10-FE-007:** Payment tab memakai `GET /admin/events/:event_id/payments`; Export mendukung CSV dan XLSX.

---

## 5. SRD v1.4 → v1.5, PRD v1.4 → v1.5, UFD v1.4 → v1.5

**SRD**
- **§13.3, §13.4:** Payment Status `Pending Payment / Paid` → `Pending Payment / Paid / Expired`. Tambahkan di §13.4: `Expired: batas waktu pembayaran terlewati.`
- **§9.2:** Payment Status `(Pending Payment / Paid)` → `(Pending Payment / Paid / Expired)`.
- **§9.5 dan §24.3:** `unique constraint: event_id + buyer_user_id` → `(registrasi aktif: bukan expired, bukan soft-deleted)`.
- **§13.2 Payment Flow:** tambahkan `Participant dapat mengganti metode selama pembayaran masih pending.`
- **§16.3:** `Satu pesan WA per buyer berisi link feedback untuk setiap participant miliknya yang attendance = Present.` Trigger tetap, tambahkan `job harian sebagai catch-up`.
- **§18.2:** tambahkan `Submitted At` sudah ada; tambahkan di §18.3: `Feedback dianggap sudah disubmit jika Submitted At terisi.`

**PRD**
- **§16.3:** `Payment Status: Pending Payment, Paid` → tambahkan `Expired`.
- **§20.2:** `Rating (skala 1-5)` → `Rating (skala 1-5, opsional; minimal salah satu dari rating/comment/suggestion harus diisi)`.
- **§12.4:** `User tidak dapat mendaftar pada event yang sama lebih dari satu kali.` → tambahkan `(registrasi yang expired tidak dihitung; user boleh mendaftar ulang)`.

**UFD**
- **§16.2:** `Rating (1-5, wajib)` → `Rating (1-5, opsional; minimal salah satu field terisi)`.
- **§14.3 Post Event:** `Link feedback form (unique per participant)` → tambahkan `Satu pesan ke buyer berisi link untuk setiap participant yang hadir.`
- **§9.9 Payment:** tambahkan `Participant dapat mengganti metode pembayaran selama masih pending.`
- **§9.11:** tambahkan `Participant dapat mendaftar ulang pada event yang sama setelah registrasi expired.`

---

## 6. UIUX Spec v1.4 → v1.5 dan Stitch Brief v1.0 → v1.1

**UIUX**
- **§7.4 Payment Status:** tambahkan `Expired (danger color)`.
- **§6.7.1 Filters Payment Status:** `All / Pending Payment / Paid` → `All / Pending Payment / Paid / Expired`.
- **§6.8 Payment Management:** Payment Status badge `Pending Payment / Paid / Expired`; Payment Deadline tidak lagi menampilkan countdown jika status bukan Pending; data berasal dari `GET /admin/events/{id}/payments`.
- **§5.4.1 Duplicate check:** `Jika email sudah terdaftar di event yang sama ...` → `Duplikasi dicek saat submit (Bayar Sekarang); jika ditolak (DUPLICATE_REGISTRATION), tampilkan "Anda sudah terdaftar pada event ini".`
- **§5.5.4 Failed:** `Pembayaran gagal diproses` → ditampilkan jika pembuatan transaksi gagal (PAYMENT_GATEWAY_ERROR); tombol "Coba Lagi" dan "Ganti Metode".

**Stitch Brief §5.4 Payment Status:** tambahkan `Expired → Danger color`.

---

## 7. AI Dev Context Guide v1.2 → v1.3

- **§1.3 tabel versi:** perbarui ke ERD v1.6, API v1.6, TAD v1.6, DTBD v1.6, SRD v1.5, PRD v1.5, UFD v1.5, UIUX v1.5, Stitch v1.1, AI Guide v1.3.
- **§3.4 Key Business Rules — tambahkan:**
  - `Registrasi expired tidak di-soft-delete dan tidak memblokir registrasi baru (unique parsial).`
  - `Payment dapat diganti metode selama pending; order_id Midtrans = {registration_id}-{unix_ts}.`
  - `Webhook untuk registrasi expired tidak boleh mengonfirmasi (log critical, balas 200).`
  - `Feedback: baris dibuat saat payment confirmed; "sudah submit" = submitted_at NOT NULL; rating opsional.`
- **§5 Source of Truth:** tambahkan baris `Jika angka endpoint/contoh di dokumen lain berbeda, ikuti API Spec.`

---

## 8. Rapikan nama file

| File sekarang | Isi sebenarnya | Nama yang disarankan |
|---|---|---|
| ERD_v1.3.txt | ERD 1.4 | arsipkan |
| ERD_v1.4.txt | ERD 1.4 | arsipkan |
| ERD_v1.5.txt | ERD 1.5 | → ERD_v1.6.txt setelah patch |
| API_Spec_v1.3 (1).txt | API 1.5 | arsipkan |
| API_Spec_v1.4 (1).txt | API 1.5 | arsipkan |
| API_Spec_v1.5.txt | API 1.5 | → API_Spec_v1.6.txt setelah patch |
| TAD_v1.3 (1).txt, TAD_v1.4 (1).txt | TAD 1.5 | → TAD_v1.6.txt setelah patch |
| DTBD_v1.3 (2).txt, DTBD_v1.4.txt, DTBD_v1.4 (1).txt | DTBD 1.4 / 1.5 (campur) | arsipkan; pakai DTBD_v1.5.txt → v1.6 |
| SRD_v1.2.txt, SRD_v1.3.txt, SRD_v1.3 (1).txt | SRD 1.3 / 1.4 | pakai SRD_v1.4.txt → v1.5 |
| PRD_v1.3.txt | PRD 1.4 | pakai PRD_v1.4.txt → v1.5 |
| UIUX_Spec_v1.3 (2).txt | UIUX 1.3 | pakai UIUX_Spec_v1.4.txt → v1.5 |
| UFD_v1.3.txt | UFD 1.4 | → UFD_v1.5.txt |
| AI_Dev_Context_Guide_v1.0/v1.1.txt | 1.1 | pakai v1.2 → v1.3 |

Taruh semua file lama di folder `archive/` supaya AI coding assistant tidak membaca versi usang.
