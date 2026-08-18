import { type CodecType, type DerivationIndex } from '@novasamatech/host-api';
import { type UserSession } from '@novasamatech/host-papp';
import { toHex } from '@polkadot-api/utils';
import { firstValueFrom } from 'rxjs';
import * as v from 'valibot';

import { accountId, accountService } from '@/domains/network';
import { productAccountGateway } from '../account/gateway';
import { productSubtreeRepository } from '../account/repository';
import { productSubtreeResource } from '../account/resource';
import { productAccountService } from '../account/service';

/** The stored subtree key for this (session, product), or null when it has never been requested. */
async function readPersistedProductSubtree(session: UserSession, productId: string): Promise<Uint8Array | null> {
  return productSubtreeRepository.read(session.id, productId);
}

/**
 * Ask the paired device for the product's subtree key and persist it.
 *
 * Throws on failure and persists nothing, so a rejection is never sticky and the next attempt
 * re-asks. Callers are expected to surface the states of this call to the user — it is an SSO
 * round trip to their phone.
 */
async function requestProductSubtree(session: UserSession, productId: string): Promise<Uint8Array> {
  const subtreeKeyBytes = await productAccountGateway.fetchProductSubtree(session, productId);
  await productSubtreeRepository.write(session.id, productId, subtreeKeyBytes);
  productSubtreeResource.invalidate({ session, productId });

  return subtreeKeyBytes;
}

/** Drops every persisted subtree key. Registered as an `onUserLoggedOutSideEffect` handler. */
async function clearPersistedProductSubtrees(): Promise<void> {
  await productSubtreeRepository.clearAll();
  productSubtreeResource.invalidateAll();
}

/** Reads the subtree key on first use, then soft-derives `/{index}` locally. */
async function getProductAccountPublicKey(
  session: UserSession,
  productId: string,
  derivationIndex: CodecType<typeof DerivationIndex>,
): Promise<Uint8Array> {
  const subtreeKey = await firstValueFrom(productSubtreeResource.read$({ session, productId }));

  return productAccountService.deriveProductAccountPublicKey(subtreeKey, derivationIndex);
}

/**
 * SS58 addresses in the order requested; one subtree read backs the whole batch.
 *
 * Reads the key once and derives locally rather than fanning out over
 * `getProductAccountPublicKey` — those calls would land in the same tick, and
 * `createQueryResource` only shares an in-flight request once its cache lookup has
 * resolved, so a fan-out costs one round trip per index on a cold cache.
 */
async function getProductAccountAddresses(
  session: UserSession,
  productId: string,
  derivationIndices: CodecType<typeof DerivationIndex>[],
): Promise<string[]> {
  // An empty batch needs no subtree key at all — reading one would throw for a caller
  // (e.g. an allocation with no smart-contract resources) that never uses the result.
  if (derivationIndices.length === 0) return [];

  const subtreeKey = await firstValueFrom(productSubtreeResource.read$({ session, productId }));

  return derivationIndices
    .map(derivationIndex => productAccountService.deriveProductAccountPublicKey(subtreeKey, derivationIndex))
    .map(publicKey => accountService.toAddress(v.parse(accountId, toHex(publicKey))).value);
}

export const productAccountUseCase = {
  readPersistedProductSubtree,
  requestProductSubtree,
  clearPersistedProductSubtrees,
  getProductAccountPublicKey,
  getProductAccountAddresses,
};
