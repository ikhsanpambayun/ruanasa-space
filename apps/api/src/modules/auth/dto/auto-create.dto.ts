import {
  EmailField,
  NameField,
  PhoneField,
} from '../../../common/validators/auth-fields.decorators';

export class AutoCreateDto {
  @NameField()
  name!: string;

  @PhoneField()
  phone_number!: string;

  @EmailField()
  email!: string;
}
