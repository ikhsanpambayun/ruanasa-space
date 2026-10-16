import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';

import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { ParseUuidPipe } from '../../common/pipes/parse-uuid.pipe';
import { Roles } from '../auth/decorators/roles.decorator';
import { AddonsService, type AddonResponse } from './addons.service';
import { AddonBodyDto } from './dto/addon.dto';

/**
 * Endpoint admin untuk add-on per event (API Spec v1.6 Section 11).
 */
@Roles('admin')
@Controller('admin/events/:eventId/addons')
export class AddonsController {
  /**
   * @param service - Logika add-on.
   */
  constructor(private readonly service: AddonsService) {}

  /**
   * GET /admin/events/:eventId/addons
   *
   * @param eventId - UUID event.
   * @returns Daftar add-on.
   */
  @Get()
  list(
    @Param('eventId', ParseUuidPipe) eventId: string,
  ): Promise<AddonResponse[]> {
    return this.service.list(eventId);
  }

  /**
   * POST /admin/events/:eventId/addons
   *
   * @param eventId - UUID event.
   * @param dto - Data add-on.
   * @returns Add-on yang dibuat.
   */
  @Post()
  @ResponseMessage('Add-on berhasil ditambahkan')
  create(
    @Param('eventId', ParseUuidPipe) eventId: string,
    @Body() dto: AddonBodyDto,
  ): Promise<AddonResponse> {
    return this.service.create(eventId, dto);
  }

  /**
   * PUT /admin/events/:eventId/addons/:addonId
   *
   * @param eventId - UUID event.
   * @param addonId - UUID add-on.
   * @param dto - Data baru.
   * @returns Add-on setelah diperbarui.
   */
  @Put(':addonId')
  @ResponseMessage('Add-on berhasil diperbarui')
  update(
    @Param('eventId', ParseUuidPipe) eventId: string,
    @Param('addonId', ParseUuidPipe) addonId: string,
    @Body() dto: AddonBodyDto,
  ): Promise<AddonResponse> {
    return this.service.update(eventId, addonId, dto);
  }

  /**
   * DELETE /admin/events/:eventId/addons/:addonId
   *
   * @param eventId - UUID event.
   * @param addonId - UUID add-on.
   */
  @Delete(':addonId')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Add-on berhasil dihapus')
  remove(
    @Param('eventId', ParseUuidPipe) eventId: string,
    @Param('addonId', ParseUuidPipe) addonId: string,
  ): Promise<void> {
    return this.service.remove(eventId, addonId);
  }
}
