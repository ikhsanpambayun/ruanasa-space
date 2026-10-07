import {
  PhoneField,
  RequiredTokenField,
} from '../../../common/validators/auth-fields.decorators';

export class GoogleLoginDto {
  @RequiredTokenField('id_token')
  id_token!: string;
}

export class CompleteGoogleRegistrationDto {
  @RequiredTokenField('temp_token')
  temp_token!: string;

  @PhoneField()
  phone_number!: string;
}
