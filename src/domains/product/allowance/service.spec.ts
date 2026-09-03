import { describe, expect, it } from 'vitest';

import { allowanceService } from './service';
import { type BulletinAuthorization } from './types';

function auth(overrides: Partial<BulletinAuthorization['extent']>, expiration = 1000): BulletinAuthorization {
  return {
    extent: { transactions: 0, transactionsAllowance: 5, bytes: 0n, bytesAllowance: 1024n, ...overrides },
    expiration,
  };
}

describe('isBulletinAuthorizationSufficient', () => {
  it('accepts a live authorization with remaining transactions and bytes', () => {
    expect(allowanceService.isBulletinAuthorizationSufficient(auth({}), 500)).toBe(true);
  });
  it('rejects absent authorization', () => {
    expect(allowanceService.isBulletinAuthorizationSufficient(null, 500)).toBe(false);
  });
  it('rejects expired authorization (strictly past expiration block)', () => {
    expect(allowanceService.isBulletinAuthorizationSufficient(auth({}), 1001)).toBe(false);
    expect(allowanceService.isBulletinAuthorizationSufficient(auth({}), 1000)).toBe(true);
  });
  it('rejects depleted transactions, clamping over-use to zero', () => {
    expect(allowanceService.isBulletinAuthorizationSufficient(auth({ transactions: 5 }), 500)).toBe(false);
    expect(allowanceService.isBulletinAuthorizationSufficient(auth({ transactions: 7 }), 500)).toBe(false);
  });
  it('rejects depleted bytes', () => {
    expect(allowanceService.isBulletinAuthorizationSufficient(auth({ bytes: 1024n }), 500)).toBe(false);
    expect(allowanceService.isBulletinAuthorizationSufficient(auth({ bytes: 2048n }), 500)).toBe(false);
  });
});

describe('currentSlotPeriod', () => {
  it('is the day index of the unix epoch', () => {
    expect(allowanceService.currentSlotPeriod(0)).toBe(0);
    expect(allowanceService.currentSlotPeriod(86_399)).toBe(0);
    expect(allowanceService.currentSlotPeriod(86_400)).toBe(1);
    expect(allowanceService.currentSlotPeriod(1_763_164_800)).toBe(20_407);
  });
});

describe('hasSlotFor', () => {
  const key = new Uint8Array(32).fill(1);
  it('finds a slot owned by the account', () => {
    expect(allowanceService.hasSlotFor([new Uint8Array(32).fill(2), key], key)).toBe(true);
  });
  it('misses when no slot matches or list is empty', () => {
    expect(allowanceService.hasSlotFor([new Uint8Array(32).fill(2)], key)).toBe(false);
    expect(allowanceService.hasSlotFor([], key)).toBe(false);
  });
});
