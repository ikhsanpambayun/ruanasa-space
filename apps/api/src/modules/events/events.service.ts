import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Event, EventStatus } from '@prisma/client';
import { toDataURL } from 'qrcode';

import {
  ERROR_CODES,
  type ErrorCode,
} from '../../common/constants/error-codes';
import { PaginatedResult } from '../../common/dto/paginated-result';
import {
  buildPagination,
  toPageWindow,
} from '../../common/dto/pagination-query.dto';
import { AppException } from '../../common/exceptions/app.exception';
import {
  formatDateOnly,
  formatTimeOnly,
  parseDateOnly,
  parseTimeOnly,
  toWibIsoString,
  todayInWib,
} from '../../common/utils/date.util';
import type { Env } from '../../config/env.validation';
import { InstructorsRepository } from '../instructors/instructors.repository';
import { PostEventNotifier } from '../notifications/post-event.notifier';
import type {
  CreateEventDto,
  ListEventsQueryDto,
  UpdateEventDto,
} from './dto/event.dto';
import {
  EventsRepository,
  type EventDetailRow,
  type EventWithInstructorName,
  type UpdateEventData,
} from './events.repository';

/** Objek event pada response create/update/duplicate (API Spec v1.6 Section 6). */
export interface EventResponse {
  id: string;
  template_id: string | null;
  instructor_id: string;
  event_name: string;
  activity_type: string;
  description: string;
  poster_url: string;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string;
  capacity: number;
  registered_count: number;
  available_slots: number;
  status: EventStatus;
  completed_at: string | null;
  post_event_sent: boolean;
  created_at: string;
  updated_at: string;
}

/** Item daftar event admin (API Spec v1.6 Section 6.1). */
export interface EventListItem {
  id: string;
  event_name: string;
  activity_type: string;
  date: string | null;
  instructor_name: string;
  capacity: number;
  registered_count: number;
  status: EventStatus;
  created_at: string;
}

/** Detail event admin (API Spec v1.6 Section 6.2). */
export interface EventDetailResponse extends EventResponse {
  instructor: { id: string; name: string; status: 'active' | 'inactive' };
  template: { id: string; name: string } | null;
  prices: {
    id: string;
    price_type: 'normal' | 'early_bird';
    price: number;
    start_date: string | null;
    end_date: string | null;
    status: 'active' | 'inactive';
  }[];
  pricing_rules: {
    id: string;
    minimum_quantity: number;
    discount_type: 'percentage' | 'fixed_amount';
    discount_value: number;
    status: 'active' | 'inactive';
  }[];
  addons: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    available_quantity: number;
    max_purchase_quantity: number;
    status: 'active' | 'inactive';
  }[];
  registration_summary: {
    registered_count: number;
    available_slots: number;
    confirmed_registrations: number;
    pending_registrations: number;
  };
}

/** Info berbagi event: URL publik dan QR code (data URL PNG). */
export interface ShareInfo {
  public_url: string;
  qr_code_url: string;
}

const EVENT_NOT_FOUND_MESSAGE = 'Event tidak ditemukan';
/** Field wajib yang tidak boleh di-null-kan lewat update. */
const REQUIRED_FIELDS = [
  ['event_name', 'Event name'],
  ['activity_type', 'Activity type'],
  ['description', 'Deskripsi'],
  ['poster_url', 'Poster URL'],
  ['location', 'Lokasi'],
  ['instructor_id', 'Instructor'],
  ['capacity', 'Kapasitas'],
] as const satisfies readonly (readonly [keyof UpdateEventDto, string])[];

/**
 * Logika bisnis manajemen event untuk admin.
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  /**
   * @param repository - Repository event.
   * @param instructors - Repository instruktur (validasi instruktur aktif).
   * @param postEvent - Pengirim notifikasi post-event.
   * @param config - Konfigurasi aplikasi (FRONTEND_URL untuk link publik).
   */
  constructor(
    private readonly repository: EventsRepository,
    private readonly instructors: InstructorsRepository,
    private readonly postEvent: PostEventNotifier,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * @param query - Filter, pencarian, dan pagination.
   * @returns Halaman event.
   */
  async list(
    query: ListEventsQueryDto,
  ): Promise<PaginatedResult<EventListItem>> {
    const { rows, total } = await this.repository.findMany({
      status: query.status,
      search: query.search || undefined,
      ...toPageWindow(query),
    });
    const registered = await this.repository.countRegisteredByEvent(
      rows.map((row) => row.id),
    );
    const items = rows.map((row) =>
      toListItem(row, registered.get(row.id) ?? 0),
    );
    return new PaginatedResult(items, buildPagination(query, total));
  }

  /**
   * @param id - UUID event.
   * @returns Detail event lengkap.
   * @throws AppException 404 EVENT_NOT_FOUND.
   */
  async get(id: string): Promise<EventDetailResponse> {
    const detail = await this.repository.findDetailById(id);
    if (!detail) {
      throw this.notFound();
    }
    const summary = await this.repository.getRegistrationSummary(id);
    return toDetail(detail, summary);
  }

  /**
   * Membuat event berstatus draft.
   *
   * @param dto - Data event.
   * @returns Event yang dibuat.
   * @throws AppException 422 bila ada field tidak valid.
   */
  async create(dto: CreateEventDto): Promise<EventResponse> {
    const errors: Record<string, string[]> = {};
    this.checkSchedule(
      errors,
      {
        date: dto.date ?? null,
        start: dto.start_time ?? null,
        end: dto.end_time ?? null,
      },
      true,
    );
    await this.checkInstructor(errors, dto.instructor_id);
    await this.checkTemplate(errors, dto.template_id ?? null);
    this.throwIfInvalid(errors);

    const created = await this.repository.create({
      templateId: dto.template_id ?? null,
      instructorId: dto.instructor_id,
      eventName: dto.event_name,
      activityType: dto.activity_type,
      description: dto.description,
      posterUrl: dto.poster_url,
      date: dto.date ? parseDateOnly(dto.date) : null,
      startTime: dto.start_time ? parseTimeOnly(dto.start_time) : null,
      endTime: dto.end_time ? parseTimeOnly(dto.end_time) : null,
      location: dto.location,
      capacity: dto.capacity,
    });
    return toEventResponse(created, 0);
  }

  /**
   * Memperbarui event (partial). Draft: semua field. Published: semua kecuali activity_type, dan jadwal tidak
   * boleh dikosongkan. Completed: ditolak. Tanggal hanya diperiksa "tidak di masa lalu" bila diubah.
   *
   * @param id - UUID event.
   * @param dto - Field yang diubah.
   * @returns Event setelah diperbarui.
   * @throws AppException 404; 403 EVENT_COMPLETED; 422 bila ada field tidak valid.
   */
  async update(id: string, dto: UpdateEventDto): Promise<EventResponse> {
    const existing = await this.getOrFail(id);
    if (existing.status === 'completed') {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.EVENT_COMPLETED,
        'Event yang sudah selesai tidak dapat diubah',
      );
    }

    const errors: Record<string, string[]> = {};
    for (const [field, label] of REQUIRED_FIELDS) {
      if (dto[field] === null) {
        this.addError(errors, field, `${label} wajib diisi`);
      }
    }

    const currentDate = formatDateOnly(existing.date);
    const schedule = {
      date: dto.date !== undefined ? dto.date : currentDate,
      start:
        dto.start_time !== undefined
          ? dto.start_time
          : formatTimeOnly(existing.startTime),
      end:
        dto.end_time !== undefined
          ? dto.end_time
          : formatTimeOnly(existing.endTime),
    };
    this.checkSchedule(
      errors,
      schedule,
      dto.date !== undefined && dto.date !== currentDate,
    );

    if (existing.status === 'published') {
      if (
        dto.activity_type !== undefined &&
        dto.activity_type !== existing.activityType
      ) {
        this.addError(
          errors,
          'activity_type',
          'Jenis aktivitas tidak dapat diubah setelah event dipublikasikan',
        );
      }
      for (const [field, value] of [
        ['date', schedule.date],
        ['start_time', schedule.start],
        ['end_time', schedule.end],
      ] as const) {
        if (value === null) {
          this.addError(
            errors,
            field,
            'Jadwal event yang sudah dipublikasikan tidak boleh dikosongkan',
          );
        }
      }
    }

    if (typeof dto.capacity === 'number') {
      const { registeredCount } =
        await this.repository.getRegistrationSummary(id);
      if (dto.capacity < registeredCount) {
        this.addError(
          errors,
          'capacity',
          `Kapasitas tidak boleh kurang dari jumlah peserta terdaftar (${registeredCount})`,
        );
      }
    }
    if (dto.instructor_id && dto.instructor_id !== existing.instructorId) {
      await this.checkInstructor(errors, dto.instructor_id);
    }
    if (dto.template_id && dto.template_id !== existing.templateId) {
      await this.checkTemplate(errors, dto.template_id);
    }
    this.throwIfInvalid(errors);

    const updated = await this.repository.update(id, toUpdateData(dto));
    const { registeredCount } =
      await this.repository.getRegistrationSummary(id);
    return toEventResponse(updated, registeredCount);
  }

  /**
   * Menghapus event (soft delete). Hanya event draft.
   *
   * @param id - UUID event.
   * @throws AppException 404; 403 EVENT_DELETE_NOT_ALLOWED.
   */
  async remove(id: string): Promise<void> {
    const existing = await this.getOrFail(id);
    const deleted =
      existing.status === 'draft' &&
      (await this.repository.softDeleteDraft(id));
    if (!deleted) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.EVENT_DELETE_NOT_ALLOWED,
        'Hanya event berstatus draft yang bisa dihapus',
      );
    }
  }

  /**
   * Mempublikasikan event draft. Syarat: minimal satu harga normal berstatus active, serta tanggal, jam mulai,
   * dan jam selesai sudah terisi.
   *
   * @param id - UUID event.
   * @returns URL publik dan QR code.
   * @throws AppException 404; 403 INVALID_STATUS_TRANSITION; 400 MISSING_PRICE / VALIDATION_ERROR.
   */
  async publish(id: string): Promise<ShareInfo> {
    const existing = await this.getOrFail(id);
    if (existing.status !== 'draft') {
      throw this.invalidTransition(
        'Hanya event draft yang bisa dipublikasikan',
      );
    }
    if (!(await this.repository.hasActiveNormalPrice(id))) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.MISSING_PRICE,
        'Event harus memiliki minimal satu harga normal',
      );
    }
    if (!existing.date || !existing.startTime || !existing.endTime) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR,
        'Tanggal dan waktu event wajib diisi sebelum dipublikasikan',
      );
    }
    if (!(await this.repository.transitionStatus(id, 'draft', 'published'))) {
      throw this.invalidTransition(
        'Hanya event draft yang bisa dipublikasikan',
      );
    }
    return this.buildShareInfo(id);
  }

  /**
   * Menandai event published sebagai selesai, lalu memicu notifikasi post-event secara asinkron
   * (kegagalan notifikasi tidak menggagalkan penyelesaian event).
   *
   * @param id - UUID event.
   * @throws AppException 404; 403 INVALID_STATUS_TRANSITION.
   */
  async complete(id: string): Promise<void> {
    const existing = await this.getOrFail(id);
    const message = 'Hanya event published yang bisa ditandai selesai';
    if (existing.status !== 'published') {
      throw this.invalidTransition(message);
    }
    if (
      !(await this.repository.transitionStatus(id, 'published', 'completed'))
    ) {
      throw this.invalidTransition(message);
    }
    void this.postEvent.notifyEventCompleted(id).catch((error: unknown) => {
      this.logger.error(
        `Post-event notification failed for event ${id}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    });
  }

  /**
   * Menduplikasi event ke draft baru tanpa tanggal/jam; harga, aturan bundle, dan add-on ikut disalin.
   *
   * @param id - UUID event sumber.
   * @returns Event baru.
   * @throws AppException 404.
   */
  async duplicate(id: string): Promise<EventResponse> {
    const copy = await this.repository.duplicate(id);
    if (!copy) {
      throw this.notFound();
    }
    return toEventResponse(copy, 0);
  }

  /**
   * @param id - UUID event.
   * @returns URL publik dan QR code.
   * @throws AppException 404.
   */
  async share(id: string): Promise<ShareInfo> {
    await this.getOrFail(id);
    return this.buildShareInfo(id);
  }

  /**
   * Memicu pengiriman ulang notifikasi post-event secara manual. Hanya untuk event completed.
   *
   * @param id - UUID event.
   * @throws AppException 404; 403 INVALID_STATUS_TRANSITION.
   */
  async sendPostEvent(id: string): Promise<void> {
    const existing = await this.getOrFail(id);
    if (existing.status !== 'completed') {
      throw this.invalidTransition('Event belum completed');
    }
    await this.postEvent.notifyEventCompleted(id);
  }

  private async getOrFail(id: string): Promise<Event> {
    const found = await this.repository.findById(id);
    if (!found) {
      throw this.notFound();
    }
    return found;
  }

  private async buildShareInfo(id: string): Promise<ShareInfo> {
    const base = this.config
      .get('FRONTEND_URL', { infer: true })
      .replace(/\/+$/, '');
    const publicUrl = `${base}/events/${id}`;
    return {
      public_url: publicUrl,
      qr_code_url: await toDataURL(publicUrl, { margin: 1, width: 320 }),
    };
  }

  private checkSchedule(
    errors: Record<string, string[]>,
    schedule: { date: string | null; start: string | null; end: string | null },
    checkPast: boolean,
  ): void {
    if (checkPast && schedule.date && schedule.date < todayInWib()) {
      this.addError(errors, 'date', 'Tanggal tidak boleh di masa lalu');
    }
    if (schedule.start && schedule.end && schedule.end <= schedule.start) {
      this.addError(errors, 'end_time', 'End time harus setelah start time');
    }
  }

  private async checkInstructor(
    errors: Record<string, string[]>,
    instructorId: string,
  ): Promise<void> {
    const instructor = await this.instructors.findById(instructorId);
    if (!instructor || instructor.status !== 'active') {
      this.addError(
        errors,
        'instructor_id',
        'Instructor tidak ditemukan atau tidak aktif',
      );
    }
  }

  private async checkTemplate(
    errors: Record<string, string[]>,
    templateId: string | null,
  ): Promise<void> {
    if (templateId && !(await this.repository.templateExists(templateId))) {
      this.addError(errors, 'template_id', 'Template tidak ditemukan');
    }
  }

  private addError(
    errors: Record<string, string[]>,
    field: string,
    message: string,
  ): void {
    (errors[field] ??= []).push(message);
  }

  private throwIfInvalid(errors: Record<string, string[]>): void {
    if (Object.keys(errors).length > 0) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ERROR_CODES.VALIDATION_ERROR,
        'Input tidak valid',
        errors,
      );
    }
  }

  private notFound(): AppException {
    return new AppException(
      HttpStatus.NOT_FOUND,
      ERROR_CODES.EVENT_NOT_FOUND,
      EVENT_NOT_FOUND_MESSAGE,
    );
  }

  private invalidTransition(message: string): AppException {
    const code: ErrorCode = ERROR_CODES.INVALID_STATUS_TRANSITION;
    return new AppException(HttpStatus.FORBIDDEN, code, message);
  }
}

/**
 * Mengubah DTO update menjadi data repository, hanya memuat field yang dikirim.
 *
 * @param dto - Body update.
 * @returns Data update parsial.
 */
function toUpdateData(dto: UpdateEventDto): UpdateEventData {
  const data: UpdateEventData = {};
  if (dto.event_name !== undefined) data.eventName = dto.event_name;
  if (dto.activity_type !== undefined) data.activityType = dto.activity_type;
  if (dto.description !== undefined) data.description = dto.description;
  if (dto.poster_url !== undefined) data.posterUrl = dto.poster_url;
  if (dto.location !== undefined) data.location = dto.location;
  if (dto.instructor_id !== undefined && dto.instructor_id !== null)
    data.instructorId = dto.instructor_id;
  if (dto.capacity !== undefined && dto.capacity !== null)
    data.capacity = dto.capacity;
  if (dto.template_id !== undefined) data.templateId = dto.template_id;
  if (dto.date !== undefined)
    data.date = dto.date ? parseDateOnly(dto.date) : null;
  if (dto.start_time !== undefined)
    data.startTime = dto.start_time ? parseTimeOnly(dto.start_time) : null;
  if (dto.end_time !== undefined)
    data.endTime = dto.end_time ? parseTimeOnly(dto.end_time) : null;
  return data;
}

/**
 * Memetakan event ke objek response.
 *
 * @param row - Baris tabel events.
 * @param registeredCount - Jumlah peserta terdaftar (pending + confirmed).
 * @returns Objek event untuk response API.
 */
function toEventResponse(row: Event, registeredCount: number): EventResponse {
  return {
    id: row.id,
    template_id: row.templateId,
    instructor_id: row.instructorId,
    event_name: row.eventName,
    activity_type: row.activityType,
    description: row.description,
    poster_url: row.posterUrl,
    date: formatDateOnly(row.date),
    start_time: formatTimeOnly(row.startTime),
    end_time: formatTimeOnly(row.endTime),
    location: row.location,
    capacity: row.capacity,
    registered_count: registeredCount,
    available_slots: Math.max(0, row.capacity - registeredCount),
    status: row.status,
    completed_at: row.completedAt ? toWibIsoString(row.completedAt) : null,
    post_event_sent: row.postEventSent,
    created_at: toWibIsoString(row.createdAt),
    updated_at: toWibIsoString(row.updatedAt),
  };
}

/**
 * @param row - Event dengan nama instruktur.
 * @param registeredCount - Jumlah peserta terdaftar.
 * @returns Item daftar admin.
 */
function toListItem(
  row: EventWithInstructorName,
  registeredCount: number,
): EventListItem {
  return {
    id: row.id,
    event_name: row.eventName,
    activity_type: row.activityType,
    date: formatDateOnly(row.date),
    instructor_name: row.instructor.name,
    capacity: row.capacity,
    registered_count: registeredCount,
    status: row.status,
    created_at: toWibIsoString(row.createdAt),
  };
}

/**
 * @param row - Event lengkap dari repository.
 * @param summary - Ringkasan registrasi.
 * @returns Detail event untuk response API.
 */
function toDetail(
  row: EventDetailRow,
  summary: {
    registeredCount: number;
    confirmedRegistrations: number;
    pendingRegistrations: number;
  },
): EventDetailResponse {
  return {
    ...toEventResponse(row, summary.registeredCount),
    instructor: {
      id: row.instructor.id,
      name: row.instructor.name,
      status: row.instructor.status,
    },
    template: row.template,
    prices: row.prices.map((p) => ({
      id: p.id,
      price_type: p.priceType,
      price: p.price,
      start_date: formatDateOnly(p.startDate),
      end_date: formatDateOnly(p.endDate),
      status: p.status,
    })),
    pricing_rules: row.pricingRules.map((r) => ({
      id: r.id,
      minimum_quantity: r.minimumQuantity,
      discount_type: r.discountType,
      discount_value: r.discountValue,
      status: r.status,
    })),
    addons: row.addons.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      price: a.price,
      available_quantity: a.availableQuantity,
      max_purchase_quantity: a.maxPurchaseQuantity,
      status: a.status,
    })),
    registration_summary: {
      registered_count: summary.registeredCount,
      available_slots: Math.max(0, row.capacity - summary.registeredCount),
      confirmed_registrations: summary.confirmedRegistrations,
      pending_registrations: summary.pendingRegistrations,
    },
  };
}
