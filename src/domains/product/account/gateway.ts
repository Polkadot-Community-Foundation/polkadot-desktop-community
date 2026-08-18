import { type UserSession } from '@novasamatech/host-papp';

/**
 * Product-account wire I/O against the paired device.
 *
 * RFC-0022 made `//product//{productId}` a hard junction, so the subtree key cannot be
 * derived locally — only the paired device holds it. Caching that round trip is
 * `resource.ts`'s job, not this file's.
 */

/** Throws on failure so a rejected read is never cached; the next read retries. */
async function fetchProductSubtree(session: UserSession, productId: string): Promise<Uint8Array> {
  const result = await session.getProductSubtree(productId);
  if (result.isErr()) throw result.error;

  return result.value;
}

export const productAccountGateway = {
  fetchProductSubtree,
};
