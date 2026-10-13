import { Matches } from 'class-validator';

import {
  EmailField,
  NameField,
  PhoneField,
  RequiredTokenField,
} from '../../../common/validators/auth-fields.decorators';

export class RequestEmailOtpDto {
  @EmailField()
  email!: string;
}

export class RequestWhatsAppOtpDto {
  @PhoneField()
  phone_number!: string;
}

export class VerifyOtpDto {
  @RequiredTokenField('otp_session_id')
  otp_session_id!: string;

  @Matches(/^\d{6}$/, { message: 'Kode OTP harus 6 digit angka' })
  otp_code!: string;
}

export class CompleteEmailRegistrationDto {
  @RequiredTokenField('temp_token')
  temp_token!: string;

  @NameField()
  name!: string;

  @PhoneField()
  phone_number!: string;
}

export class CompleteWhatsAppRegistrationDto {
  @RequiredTokenField('temp_token')
  temp_token!: string;

  @NameField()
  name!: string;

  @EmailField()
  email!: string;
}
