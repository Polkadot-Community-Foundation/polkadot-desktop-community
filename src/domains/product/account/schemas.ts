import * as v from 'valibot';

/**
 * Trust boundary for persisted subtree-key rows read back out of IndexedDB.
 *
 * The stored value is fed to `HDKD.publicSoft`, which decodes it as a ristretto255 point — a
 * truncated or hand-edited row throws deep inside `@noble` rather than degrading. That matters
 * more here than for an ordinary cache row: the key is written once and never re-requested for
 * a pairing, so a malformed row is permanent for that scope instead of self-healing on the next
 * fetch. Validation is applied in `repository.ts`, the single chokepoint both the resource and
 * `productAccountUseCase.readPersistedProductSubtree` read through.
 */

const SUBTREE_KEY_BYTES = 32;

export const productSubtreeRowSchema = v.object({
  key: v.string(),
  sessionId: v.string(),
  productId: v.string(),
  subtreeKey: v.pipe(
    v.instance(Uint8Array),
    v.check(bytes => bytes.length === SUBTREE_KEY_BYTES, 'subtree key must be 32 bytes'),
  ),
  createdAt: v.number(),
});
