import { BadRequestException } from '@nestjs/common';
import { parsePhoneNumberFromString, CountryCode } from 'libphonenumber-js';

/** Normalises a user-typed number to E.164, accepting only the allowed countries. */
export function normalizePhone(input: string, allowedCountries: string[]): string {
  const defaultCountry = (allowedCountries[0] ?? 'CI') as CountryCode;
  const parsed = parsePhoneNumberFromString(input, defaultCountry);
  if (!parsed || !parsed.isValid() || !parsed.country || !allowedCountries.includes(parsed.country)) {
    throw new BadRequestException({ code: 'INVALID_PHONE', message: 'Numéro de téléphone invalide' });
  }
  return parsed.number;
}

/** "+2250708123456" -> "+225 07 •• •• 56" for display to the owner. */
export function maskPhone(e164: string): string {
  const tail = e164.slice(-2);
  const head = e164.slice(0, 6);
  return `${head.slice(0, 4)} ${head.slice(4)} •• •• ${tail}`;
}
