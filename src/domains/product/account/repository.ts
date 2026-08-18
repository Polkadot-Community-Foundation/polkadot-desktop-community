import * as v from 'valibot';

import { type ProductSubtreeRow, database } from '@/shared/database';

import { productSubtreeRowSchema } from './schemas';

// The subtree key is a PUBLIC key (RFC-0022 `ApProductSubtreeResponse.product_public_key`)
// used only as the parent of a soft derivation, so persisting it leaks no secret.
// Keyed on the session id as well as the product: a re-pair mints a new session, and
// must never serve the previous pairing's key.
const rowKey = (sessionId: string, productId: string): string => `${sessionId}:${productId}`;

async function read(sessionId: string, productId: string): Promise<Uint8Array | null> {
  const row = await database.productSubtrees.get(rowKey(sessionId, productId));
  if (!row) return null;

  // A malformed row reads as a miss rather than throwing: the gate then re-requests the key
  // from the device, which is the only way a bad row can ever be replaced. Failing loudly here
  // would strand the pairing instead — nothing rewrites the row on a read error.
  if (!v.is(productSubtreeRowSchema, row)) {
    console.warn('[product-subtree] dropped a malformed persisted row for %s', productId);
    await database.productSubtrees.delete(rowKey(sessionId, productId));

    return null;
  }

  return row.subtreeKey;
}

async function write(sessionId: string, productId: string, subtreeKey: Uint8Array): Promise<void> {
  const row: ProductSubtreeRow = {
    key: rowKey(sessionId, productId),
    sessionId,
    productId,
    subtreeKey,
    createdAt: Date.now(),
  };

  await database.productSubtrees.put(row);
}

async function clearAll(): Promise<void> {
  await database.productSubtrees.clear();
}

export const productSubtreeRepository = { read, write, clearAll };
