import { equalBytes } from '@noble/ciphers/utils.js';

import { SLOT_PERIOD_SECONDS } from './constants';
import { type BulletinAuthorization } from './types';

// Sufficiency semantics mirror the Android app (TransactionStorageAuthorization.kt):
// absent/expired counts as none; remaining = allowance − used, clamped at zero.
function isBulletinAuthorizationSufficient(authorization: Nullable<BulletinAuthorization>, currentBlock: number): boolean {
  if (!authorization) return false;
  if (currentBlock > authorization.expiration) return false;
  const remainingTransactions = Math.max(authorization.extent.transactionsAllowance - authorization.extent.transactions, 0);
  const remainingBytes = authorization.extent.bytesAllowance - authorization.extent.bytes;
  return remainingTransactions > 0 && remainingBytes > 0n;
}

function currentSlotPeriod(nowSeconds: number): number {
  return Math.floor(nowSeconds / SLOT_PERIOD_SECONDS);
}

function hasSlotFor(slotAccounts: Uint8Array[], publicKey: Uint8Array): boolean {
  return slotAccounts.some(slotAccount => equalBytes(slotAccount, publicKey));
}

export const allowanceService = { isBulletinAuthorizationSufficient, currentSlotPeriod, hasSlotFor };
