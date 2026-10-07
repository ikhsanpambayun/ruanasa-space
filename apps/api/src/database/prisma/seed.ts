import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

import { BCRYPT_ROUNDS } from '../../common/constants/security';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@ruanasaspace.com';
// Placeholder: kolom phone_number NOT NULL UNIQUE (DTBD P1-DB-003).
const ADMIN_PHONE = '081200000000';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Membuat tanggal (hanya bagian DATE) sekian hari dari sekarang, dalam UTC.
 *
 * @param days - Selisih hari dari hari ini.
 * @returns Date pada tengah malam UTC.
 */
function daysFromNow(days: number): Date {
  const target = new Date(Date.now() + days * DAY_MS);
  return new Date(
    Date.UTC(
      target.getUTCFullYear(),
      target.getUTCMonth(),
      target.getUTCDate(),
    ),
  );
}

/**
 * Membuat nilai kolom TIME dari jam dan menit.
 *
 * @param hours - Jam (0-23).
 * @param minutes - Menit (0-59).
 * @returns Date 1970-01-01 pada jam tersebut (UTC), sesuai representasi Prisma untuk TIME.
 */
function timeOfDay(hours: number, minutes: number): Date {
  return new Date(Date.UTC(1970, 0, 1, hours, minutes));
}

/**
 * Membuat atau memperbarui akun admin. Password dibaca dari SEED_ADMIN_PASSWORD, tidak pernah di-hardcode.
 *
 * @returns Promise yang selesai setelah admin tersimpan.
 * @throws Error bila SEED_ADMIN_PASSWORD kosong.
 */
async function seedAdmin(): Promise<void> {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) {
    throw new Error('SEED_ADMIN_PASSWORD is required to seed the admin user');
  }

  const passwordHash = await hash(password, BCRYPT_ROUNDS);
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { passwordHash },
    create: {
      name: 'Admin Ruanasa',
      email: ADMIN_EMAIL,
      phoneNumber: ADMIN_PHONE,
      role: 'admin',
      authProvider: 'email_otp',
      passwordHash,
    },
  });
}

/**
 * Membuat specialization contoh.
 *
 * @returns Map nama specialization ke id.
 */
async function seedSpecializations(): Promise<Record<string, string>> {
  const names = ['Vinyasa Yoga', 'Hatha Yoga', 'Yin Yoga'];
  const ids: Record<string, string> = {};

  for (const name of names) {
    const specialization = await prisma.specialization.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    ids[name] = specialization.id;
  }
  return ids;
}

/**
 * Membuat instruktur contoh beserta mapping specialization.
 *
 * @param specializationIds - Map nama specialization ke id.
 * @returns Map nama instruktur ke id.
 */
async function seedInstructors(
  specializationIds: Record<string, string>,
): Promise<Record<string, string>> {
  const definitions = [
    {
      name: 'Ayu Prameswari',
      bio: 'Instruktur yoga bersertifikat dengan fokus pada alignment dan pernapasan.',
      contactInformation: '@ayu.yoga',
      specializations: ['Vinyasa Yoga', 'Hatha Yoga'],
    },
    {
      name: 'Bima Santoso',
      bio: 'Pengajar yin yoga dan meditasi untuk pemulihan tubuh dan pikiran.',
      contactInformation: '@bima.flow',
      specializations: ['Yin Yoga'],
    },
  ];
  const ids: Record<string, string> = {};

  for (const definition of definitions) {
    const existing = await prisma.instructor.findFirst({
      where: { name: definition.name },
    });
    const instructor =
      existing ??
      (await prisma.instructor.create({
        data: {
          name: definition.name,
          bio: definition.bio,
          contactInformation: definition.contactInformation,
          specializations: {
            create: definition.specializations.map((name) => ({
              specializationId: specializationIds[name],
            })),
          },
        },
      }));
    ids[definition.name] = instructor.id;
  }
  return ids;
}

/**
 * Membuat dua event contoh: satu draft (tanggal/waktu kosong) dan satu published
 * lengkap dengan harga normal, early bird, bundle discount, dan add-on.
 *
 * @param instructorIds - Map nama instruktur ke id.
 * @returns Promise yang selesai setelah event tersimpan.
 */
async function seedEvents(
  instructorIds: Record<string, string>,
): Promise<void> {
  const draftName = 'Yin Yoga & Meditasi (Draft)';
  if (
    !(await prisma.event.findFirst({
      where: { eventName: draftName, deletedAt: null },
    }))
  ) {
    await prisma.event.create({
      data: {
        instructorId: instructorIds['Bima Santoso'],
        eventName: draftName,
        activityType: 'yoga',
        description:
          'Sesi yin yoga lambat dilanjutkan meditasi singkat untuk melepas ketegangan.',
        posterUrl: 'https://placehold.co/800x1000?text=Yin+Yoga',
        location: 'Ruanasa Studio, Jakarta Selatan',
        capacity: 15,
        status: 'draft',
      },
    });
  }

  const publishedName = 'Vinyasa Flow Pagi';
  if (
    !(await prisma.event.findFirst({
      where: { eventName: publishedName, deletedAt: null },
    }))
  ) {
    await prisma.event.create({
      data: {
        instructorId: instructorIds['Ayu Prameswari'],
        eventName: publishedName,
        activityType: 'yoga',
        description:
          'Kelas vinyasa dinamis untuk semua level, dipandu langsung oleh instruktur bersertifikat.',
        posterUrl: 'https://placehold.co/800x1000?text=Vinyasa+Flow',
        date: daysFromNow(14),
        startTime: timeOfDay(8, 0),
        endTime: timeOfDay(9, 30),
        location: 'Ruanasa Studio, Jakarta Selatan',
        capacity: 20,
        status: 'published',
        prices: {
          create: [
            { priceType: 'normal', price: 150000 },
            {
              priceType: 'early_bird',
              price: 120000,
              startDate: daysFromNow(0),
              endDate: daysFromNow(7),
            },
          ],
        },
        pricingRules: {
          create: [
            {
              ruleType: 'bundle',
              minimumQuantity: 2,
              discountType: 'percentage',
              discountValue: 10,
            },
            {
              ruleType: 'bundle',
              minimumQuantity: 3,
              discountType: 'percentage',
              discountValue: 15,
            },
          ],
        },
        addons: {
          create: [
            {
              name: 'Sewa Yoga Mat',
              description: 'Yoga mat bersih untuk dipakai selama kelas.',
              price: 25000,
              availableQuantity: 20,
              maxPurchaseQuantity: 2,
            },
          ],
        },
      },
    });
  }
}

/**
 * Membuat kode promo contoh (aktif, 10%).
 *
 * @returns Promise yang selesai setelah kode promo tersimpan.
 */
async function seedDiscountCode(): Promise<void> {
  await prisma.discountCode.upsert({
    where: { code: 'WELCOME10' },
    update: {},
    create: {
      code: 'WELCOME10',
      discountType: 'percentage',
      discountValue: 10,
      quota: 100,
      expiryDate: daysFromNow(90),
    },
  });
}

/**
 * Menjalankan seluruh seed secara idempoten.
 *
 * @returns Promise yang selesai setelah semua data tersimpan.
 */
async function main(): Promise<void> {
  await seedAdmin();
  const specializationIds = await seedSpecializations();
  const instructorIds = await seedInstructors(specializationIds);
  await seedEvents(instructorIds);
  await seedDiscountCode();
  console.log('Seed completed');
}

void main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
