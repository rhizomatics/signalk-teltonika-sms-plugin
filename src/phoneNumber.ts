/**
 * Permissive E.164 format check ("+" then 7-15 digits, first digit non-zero) - not full number
 * validation (no per-country length/prefix rules), just enough to catch a locally-formatted
 * number (e.g. "07123 456789") before it's silently sent to the router's SMS API, which expects
 * international format.
 */
export const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

export function isE164PhoneNumber(number: string): boolean {
  return E164_PATTERN.test(number);
}

export function requireE164PhoneNumber(number: string): void {
  if (!isE164PhoneNumber(number)) {
    throw new Error(`"${number}" is not an international phone number - expected a leading "+" and country code, e.g. "+447123456789"`);
  }
}
