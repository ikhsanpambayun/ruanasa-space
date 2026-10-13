import { Body, Controller, Get, Put, Query } from '@nestjs/common';

import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import type { PaginatedResult } from '../../common/dto/paginated-result';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import {
  UsersService,
  type EventHistoryItem,
  type ProfileResponse,
} from './users.service';

/**
 * Endpoint profil untuk peserta (API Spec v1.6 Section 4). Semua endpoint khusus role participant.
 */
@Roles('participant')
@Controller('users')
export class UsersController {
  /**
   * @param service - Logika profil.
   */
  constructor(private readonly service: UsersService) {}

  /**
   * GET /users/profile
   *
   * @param userId - UUID user dari token.
   * @returns Profil user.
   */
  @Get('profile')
  getProfile(@CurrentUser('id') userId: string): Promise<ProfileResponse> {
    return this.service.getProfile(userId);
  }

  /**
   * PUT /users/profile
   *
   * @param userId - UUID user dari token.
   * @param dto - Nama, email, dan nomor telepon baru.
   * @returns Profil setelah diperbarui.
   */
  @Put('profile')
  @ResponseMessage('Profil berhasil diperbarui')
  updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResponse> {
    return this.service.updateProfile(userId, dto);
  }

  /**
   * GET /users/event-history?page=&per_page=
   *
   * @param userId - UUID user dari token.
   * @param query - Pagination.
   * @returns Halaman riwayat event.
   */
  @Get('event-history')
  getEventHistory(
    @CurrentUser('id') userId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<EventHistoryItem>> {
    return this.service.getEventHistory(userId, query);
  }
}
