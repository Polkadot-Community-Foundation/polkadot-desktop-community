import { type UserSession } from '@novasamatech/host-papp';
import { deriveSlotAccountPublicKey, ensureSubstrateSlotSr25519Ready } from '@novasamatech/statement-store';

import { withTimeout } from '@/shared/utils';
import { environmentUseCase, lazyClient } from '@/domains/application';
import { chainRegistry } from '@/domains/network';
import { ALLOWANCE_CHECK_TIMEOUT_MS } from '../allowance/constants';
import { allowanceGateway } from '../allowance/gateway';
import { allowanceService } from '../allowance/service';
import { type AllowanceResourceKind } from '../allowance/types';

type CheckResourcesSufficiencyParams = {
  session: Pick<UserSession, 'readAllowance'>;
  productId: string;
  kinds: AllowanceResourceKind[];
};

async function isBulletinSufficient(publicKey: Uint8Array): Promise<boolean> {
  const { bulletinChain } = await environmentUseCase.getActive();
  // The inner timeout settles the `requestApi` callback within the pre-check
  // budget, releasing the Bulletin chain lock at 8s instead of `requestApi`'s
  // own longer bound; the `null` fallback reads as "insufficient".
  const snapshot = await chainRegistry.requestApi(bulletinChain, api =>
    withTimeout(allowanceGateway.getBulletinAuthorization(api.client, publicKey), ALLOWANCE_CHECK_TIMEOUT_MS, null),
  );
  if (!snapshot) return false;
  return allowanceService.isBulletinAuthorizationSufficient(snapshot.authorization, snapshot.currentBlock);
}

async function isStatementStoreSufficient(publicKey: Uint8Array): Promise<boolean> {
  const period = allowanceService.currentSlotPeriod(Date.now() / 1000);
  const slots = await allowanceGateway.getStatementStoreSlots(lazyClient.getClient().getUnsafeApi(), period);
  return allowanceService.hasSlotFor(slots, publicKey);
}

async function isKindSufficient(
  session: Pick<UserSession, 'readAllowance'>,
  productId: string,
  kind: AllowanceResourceKind,
): Promise<boolean> {
  const secret = await session.readAllowance(productId, kind).unwrapOr(null);
  if (!secret) return false;
  await ensureSubstrateSlotSr25519Ready();
  const publicKey = deriveSlotAccountPublicKey(secret);
  return kind === 'bulletin' ? isBulletinSufficient(publicKey) : isStatementStoreSufficient(publicKey);
}

/**
 * True only if EVERY requested resource kind already has a sufficient on-chain
 * grant for the product's slot account. Conservative by construction: empty
 * input, timeout, or any failure resolves false → caller proceeds with SSO.
 */
async function checkResourcesSufficiency({ session, productId, kinds }: CheckResourcesSufficiencyParams): Promise<boolean> {
  if (kinds.length === 0) return false;
  const check = Promise.all(kinds.map(kind => isKindSufficient(session, productId, kind)))
    .then(results => results.every(Boolean))
    .catch(() => false);

  return withTimeout(check, ALLOWANCE_CHECK_TIMEOUT_MS, false);
}

export const allowanceUseCase = { checkResourcesSufficiency };
