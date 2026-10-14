import { Module } from '@nestjs/common';

import { InstructorsModule } from '../instructors/instructors.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EventsAdminController } from './events-admin.controller';
import { EventsRepository } from './events.repository';
import { EventsService } from './events.service';

/**
 * Modul event. Saat ini memuat manajemen event untuk admin (P3-BE-002); endpoint publik ditambahkan di P3-BE-003.
 * Repository diekspor untuk modul harga, add-on, dan registrasi.
 */
@Module({
  imports: [InstructorsModule, NotificationsModule],
  controllers: [EventsAdminController],
  providers: [EventsService, EventsRepository],
  exports: [EventsRepository],
})
export class EventsModule {}
