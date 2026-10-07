import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RATE_LIMITS } from './common/constants/rate-limits';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './database/prisma.module';
import { AddonsModule } from './modules/addons/addons.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AuthModule } from './modules/auth/auth.module';
import { DiscountsModule } from './modules/discounts/discounts.module';
import { EventsModule } from './modules/events/events.module';
import { ExportsModule } from './modules/exports/exports.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { InstructorsModule } from './modules/instructors/instructors.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ParticipantsModule } from './modules/participants/participants.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { RegistrationsModule } from './modules/registrations/registrations.module';
import { SpecializationsModule } from './modules/specializations/specializations.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: RATE_LIMITS.GENERAL.ttl,
        limit: RATE_LIMITS.GENERAL.limit,
      },
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    EventsModule,
    TemplatesModule,
    InstructorsModule,
    SpecializationsModule,
    PricingModule,
    AddonsModule,
    DiscountsModule,
    RegistrationsModule,
    ParticipantsModule,
    PaymentsModule,
    AttendanceModule,
    FeedbackModule,
    NotificationsModule,
    AnalyticsModule,
    ExportsModule,
    UploadsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
