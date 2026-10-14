import { todayInWib } from '../../src/common/utils/date.util';
import { InstructorsRepository } from '../../src/modules/instructors/instructors.repository';
import { PostEventNotifier } from '../../src/modules/notifications/post-event.notifier';
import { EventsRepository } from '../../src/modules/events/events.repository';
import {
  createTestApp,
  type AuthHeader,
  type TestApp,
} from './create-test-app';
import { FakeEventsRepository } from './fake-events.repository';
import { FakeInstructorsRepository } from './fake-instructors.repository';
import { FakeSpecializationsRepository } from './fake-specializations.repository';

/**
 * Notifier post-event palsu: mencatat pemanggilan dan dapat dipaksa gagal.
 */
export class FakePostEventNotifier extends PostEventNotifier {
  readonly calls: string[] = [];
  failNext = false;

  notifyEventCompleted(eventId: string): Promise<void> {
    this.calls.push(eventId);
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error('provider down'));
    }
    return Promise.resolve();
  }
}

export interface EventsTestContext {
  ctx: TestApp;
  events: FakeEventsRepository;
  instructors: FakeInstructorsRepository;
  notifier: FakePostEventNotifier;
  admin: AuthHeader;
  activeInstructor: string;
  inactiveInstructor: string;
}

/**
 * Membuat app test untuk modul event dengan repository palsu, satu instruktur aktif dan satu nonaktif.
 *
 * @returns Konteks test.
 */
export async function setupEventsApp(): Promise<EventsTestContext> {
  const specs = new FakeSpecializationsRepository();
  const instructors = new FakeInstructorsRepository(specs);
  const events = new FakeEventsRepository(instructors);
  const notifier = new FakePostEventNotifier();
  const ctx = await createTestApp({
    configure: (builder) =>
      builder
        .overrideProvider(InstructorsRepository)
        .useValue(instructors)
        .overrideProvider(EventsRepository)
        .useValue(events)
        .overrideProvider(PostEventNotifier)
        .useValue(notifier),
  });
  return {
    ctx,
    events,
    instructors,
    notifier,
    admin: ctx.asAdmin(),
    activeInstructor: instructors.seed({
      name: 'Ayu Prameswari',
      status: 'active',
    }),
    inactiveInstructor: instructors.seed({
      name: 'Bima Cuti',
      status: 'inactive',
    }),
  };
}

/**
 * Tanggal WIB hari ini digeser sekian hari, format YYYY-MM-DD.
 *
 * @param days - Selisih hari (negatif = lampau).
 * @returns Tanggal.
 */
export function daysFromToday(days: number): string {
  const [year, month, day] = todayInWib().split('-').map(Number) as [
    number,
    number,
    number,
  ];
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}
