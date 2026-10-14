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
  Query,
} from '@nestjs/common';

import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import type { PaginatedResult } from '../../common/dto/paginated-result';
import { ParseUuidPipe } from '../../common/pipes/parse-uuid.pipe';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CreateEventDto,
  ListEventsQueryDto,
  UpdateEventDto,
} from './dto/event.dto';
import {
  EventsService,
  type EventDetailResponse,
  type EventListItem,
  type EventResponse,
  type ShareInfo,
} from './events.service';

/**
 * Endpoint admin untuk manajemen event (API Spec v1.6 Sections 6.1-6.10).
 */
@Roles('admin')
@Controller('admin/events')
export class EventsAdminController {
  /**
   * @param service - Logika event.
   */
  constructor(private readonly service: EventsService) {}

  /**
   * GET /admin/events?page=&per_page=&status=&search=
   *
   * @param query - Filter dan pagination.
   * @returns Halaman event.
   */
  @Get()
  list(
    @Query() query: ListEventsQueryDto,
  ): Promise<PaginatedResult<EventListItem>> {
    return this.service.list(query);
  }

  /**
   * GET /admin/events/:id
   *
   * @param id - UUID event.
   * @returns Detail event.
   */
  @Get(':id')
  get(@Param('id', ParseUuidPipe) id: string): Promise<EventDetailResponse> {
    return this.service.get(id);
  }

  /**
   * POST /admin/events
   *
   * @param dto - Data event.
   * @returns Event draft yang dibuat.
   */
  @Post()
  @ResponseMessage('Event berhasil dibuat')
  create(@Body() dto: CreateEventDto): Promise<EventResponse> {
    return this.service.create(dto);
  }

  /**
   * PUT /admin/events/:id (partial update)
   *
   * @param id - UUID event.
   * @param dto - Field yang diubah.
   * @returns Event setelah diperbarui.
   */
  @Put(':id')
  @ResponseMessage('Event berhasil diperbarui')
  update(
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateEventDto,
  ): Promise<EventResponse> {
    return this.service.update(id, dto);
  }

  /**
   * DELETE /admin/events/:id (soft delete, draft saja)
   *
   * @param id - UUID event.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Event berhasil dihapus')
  remove(@Param('id', ParseUuidPipe) id: string): Promise<void> {
    return this.service.remove(id);
  }

  /**
   * POST /admin/events/:id/publish
   *
   * @param id - UUID event.
   * @returns URL publik dan QR code.
   */
  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Event berhasil dipublikasikan')
  publish(@Param('id', ParseUuidPipe) id: string): Promise<ShareInfo> {
    return this.service.publish(id);
  }

  /**
   * POST /admin/events/:id/complete
   *
   * @param id - UUID event.
   */
  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Event ditandai selesai')
  complete(@Param('id', ParseUuidPipe) id: string): Promise<void> {
    return this.service.complete(id);
  }

  /**
   * POST /admin/events/:id/duplicate
   *
   * @param id - UUID event sumber.
   * @returns Event draft baru.
   */
  @Post(':id/duplicate')
  @ResponseMessage('Event berhasil diduplikasi')
  duplicate(@Param('id', ParseUuidPipe) id: string): Promise<EventResponse> {
    return this.service.duplicate(id);
  }

  /**
   * GET /admin/events/:id/share
   *
   * @param id - UUID event.
   * @returns URL publik dan QR code.
   */
  @Get(':id/share')
  share(@Param('id', ParseUuidPipe) id: string): Promise<ShareInfo> {
    return this.service.share(id);
  }

  /**
   * POST /admin/events/:id/send-post-event
   *
   * @param id - UUID event (harus completed).
   */
  @Post(':id/send-post-event')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Post-event notification dikirim')
  sendPostEvent(@Param('id', ParseUuidPipe) id: string): Promise<void> {
    return this.service.sendPostEvent(id);
  }
}
