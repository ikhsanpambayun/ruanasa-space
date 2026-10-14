import { PartialType } from '@nestjs/mapped-types';
import type { EventStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  DateOnlyField,
  RequiredText,
  RequiredUrl,
  TimeOnlyField,
  trimIfString,
} from '../../../common/validators/common-fields.decorators';

const EVENT_STATUSES: EventStatus[] = ['draft', 'published', 'completed'];
/** Batas atas kapasitas yang masuk akal; mencegah angka yang melewati INTEGER database. */
const MAX_CAPACITY = 100_000;

/**
 * Body create event (API Spec v1.6 Section 6.3).
 * `date`, `start_time`, dan `end_time` opsional pada draft (nullable di ERD, keputusan K1);
 * ketiganya wajib terisi saat publish.
 */
export class CreateEventDto {
  @RequiredText('Event name', 150)
  event_name!: string;

  @RequiredText('Activity type', 50)
  activity_type!: string;

  @RequiredText('Deskripsi', 5000)
  description!: string;

  @RequiredUrl('Poster URL', 500)
  poster_url!: string;

  @IsOptional()
  @DateOnlyField()
  date?: string | null;

  @IsOptional()
  @TimeOnlyField('Start time')
  start_time?: string | null;

  @IsOptional()
  @TimeOnlyField('End time')
  end_time?: string | null;

  @RequiredText('Lokasi', 500)
  location!: string;

  @IsUUID('all', { message: 'ID instructor tidak valid' })
  instructor_id!: string;

  @IsInt({ message: 'Kapasitas harus berupa angka bulat' })
  @Min(1, { message: 'Kapasitas minimal 1' })
  @Max(MAX_CAPACITY, { message: `Kapasitas maksimal ${MAX_CAPACITY}` })
  capacity!: number;

  @IsOptional()
  @IsUUID('all', { message: 'ID template tidak valid' })
  template_id?: string | null;
}

/**
 * Body update event: semua field opsional (partial update). Nilai `null` yang tidak diizinkan
 * (field wajib) ditolak oleh service.
 */
export class UpdateEventDto extends PartialType(CreateEventDto) {}

/**
 * Query daftar event admin: `?page=&per_page=&status=&search=`.
 */
export class ListEventsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(EVENT_STATUSES, {
    message: 'Status harus draft, published, atau completed',
  })
  status?: EventStatus;

  @Transform(({ value }: { value: unknown }) => trimIfString(value))
  @IsOptional()
  @IsString({ message: 'search harus berupa teks' })
  @MaxLength(100, { message: 'search maksimal 100 karakter' })
  search?: string;
}
