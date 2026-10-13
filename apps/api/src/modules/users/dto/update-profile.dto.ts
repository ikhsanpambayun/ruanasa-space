import {
  EmailField,
  NameField,
  PhoneField,
} from '../../../common/validators/auth-fields.decorators';

/**
 * Body update profil (API Spec v1.6 Section 4.2). Hanya tiga field ini yang dapat diubah;
 * field lain (role, auth_provider, dan sebagainya) ditolak oleh validation pipe.
 */
export class UpdateProfileDto {
  @NameField()
  name!: string;

  @EmailField()
  email!: string;

  @PhoneField()
  phone_number!: string;
}
