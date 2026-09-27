import { describe, it, expect } from 'vitest';
import { isValidEmail } from './email-validator.js';

describe('isValidEmail (RFC 5321)', () => {
  it('accepts standard valid emails', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('user.name+tag@sub.domain.org')).toBe(true);
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('test123@test-domain.io')).toBe(true);
  });

  it('rejects missing @ symbol', () => {
    expect(isValidEmail('userexample.com')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });

  it('rejects local part exceeding 64 characters', () => {
    const longLocal = 'a'.repeat(65) + '@example.com';
    expect(isValidEmail(longLocal)).toBe(false);
  });

  it('rejects total length exceeding 320 characters', () => {
    const longEmail = 'a'.repeat(300) + '@example.com';
    expect(isValidEmail(longEmail)).toBe(false);
  });

  it('rejects missing domain', () => {
    expect(isValidEmail('user@')).toBe(false);
  });

  it('rejects domain without TLD', () => {
    expect(isValidEmail('user@localhost')).toBe(false);
  });

  it('rejects double dots in local part', () => {
    expect(isValidEmail('user..name@example.com')).toBe(false);
  });

  it('rejects leading dot in local part', () => {
    expect(isValidEmail('.user@example.com')).toBe(false);
  });

  it('accepts special characters in local part', () => {
    expect(isValidEmail('user+filter@example.com')).toBe(true);
    expect(isValidEmail('user_name@example.com')).toBe(true);
  });
});
