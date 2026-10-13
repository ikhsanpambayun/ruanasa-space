import {
  CANONICAL_PHONE_PATTERN,
  normalizePhone,
  toInternationalPhone,
} from './phone.util';

describe('normalizePhone', () => {
  it.each([
    ['081234567890', '081234567890'],
    ['0812-3456-7890', '081234567890'],
    ['0812 3456 7890', '081234567890'],
    ['(0812) 3456.7890', '081234567890'],
    ['+6281234567890', '081234567890'],
    ['+62 812 3456 7890', '081234567890'],
    ['6281234567890', '081234567890'],
    ['81234567890', '081234567890'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('leaves unrecognised input untouched so the validator rejects it', () => {
    expect(normalizePhone('abc')).toBe('abc');
    expect(normalizePhone('12345')).toBe('12345');
  });
});

describe('CANONICAL_PHONE_PATTERN', () => {
  it.each(['081234567890', '0812345678', '0812345678901'])(
    'accepts %s',
    (phone) => {
      expect(CANONICAL_PHONE_PATTERN.test(phone)).toBe(true);
    },
  );

  it.each([
    '0212345678', // telepon rumah / bukan seluler
    '08123', // terlalu pendek
    '08123456789012345', // terlalu panjang
    '+6281234567890', // belum dinormalkan
    '0812345678a0',
    '',
  ])('rejects "%s"', (phone) => {
    expect(CANONICAL_PHONE_PATTERN.test(phone)).toBe(false);
  });
});

describe('toInternationalPhone', () => {
  it('replaces the leading 0 with the 62 country code', () => {
    expect(toInternationalPhone('081234567890')).toBe('6281234567890');
  });
});
