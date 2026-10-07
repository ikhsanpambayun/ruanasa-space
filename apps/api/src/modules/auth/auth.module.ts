import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import type { Env } from '../../config/env.validation';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionRefreshInterceptor } from './interceptors/session-refresh.interceptor';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenBlacklistStore } from './token-blacklist.store';
import { TokenService } from './token.service';

/**
 * Modul autentikasi: JWT (HS256), cookie sesi, blacklist logout, dan sliding window.
 * Guard global (JwtAuthGuard, RolesGuard) didaftarkan di AppModule.
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    TokenBlacklistStore,
    JwtStrategy,
    { provide: APP_INTERCEPTOR, useClass: SessionRefreshInterceptor },
  ],
  exports: [TokenService],
})
export class AuthModule {}
