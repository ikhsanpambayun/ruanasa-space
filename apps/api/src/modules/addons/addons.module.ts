import { Module } from '@nestjs/common';

import { EventsModule } from '../events/events.module';
import { AddonsController } from './addons.controller';
import { AddonsRepository } from './addons.repository';
import { AddonsService } from './addons.service';

/**
 * Modul add-on event (P3-BE-008). Pengurangan dan pengembalian stok oleh registrasi ditambahkan di Phase 4.
 */
@Module({
  imports: [EventsModule],
  controllers: [AddonsController],
  providers: [AddonsService, AddonsRepository],
  exports: [AddonsRepository],
})
export class AddonsModule {}
