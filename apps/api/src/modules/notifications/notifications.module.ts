import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.validation';
import { EMAIL_PROVIDER } from './adapters/email.adapter';
import {
  createEmailProvider,
  createWhatsAppProvider,
} from './adapters/provider.factories';
import { WHATSAPP_PROVIDER } from './adapters/whatsapp.adapter';

/**
 * Modul notifikasi. Saat ini menyediakan adapter provider email dan WhatsApp (dipakai OTP);
 * orkestrasi notifikasi, job, dan notifikasi in-app admin ditambahkan di Phase 6.
 */
@Module({
  providers: [
    {
      provide: EMAIL_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createEmailProvider(config),
    },
    {
      provide: WHATSAPP_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createWhatsAppProvider(config),
    },
  ],
  exports: [EMAIL_PROVIDER, WHATSAPP_PROVIDER],
})
export class NotificationsModule {}
