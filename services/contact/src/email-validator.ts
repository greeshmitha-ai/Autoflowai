/**
 * RFC 5321 email validation.
 * Validates the local part (max 64 chars) and domain part (max 255 chars),
 * total max 320 chars, with basic structural checks.
 */

// RFC 5321: local part max 64, domain max 255, total max 320
const RFC5321_REGEX =
  /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

export function isValidEmail(email: string): boolean {
  if (!email || email.length > 320) return false;

  const atIndex = email.lastIndexOf('@');
  if (atIndex < 1) return false;

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);

  if (local.length > 64) return false;
  if (domain.length > 255) return false;

  return RFC5321_REGEX.test(email);
}
