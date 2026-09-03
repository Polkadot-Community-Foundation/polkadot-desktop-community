import { type UserSession } from '@novasamatech/host-papp';

import { createQueryResource } from '@/shared/resource';

import { productSubtreeRepository } from './repository';

type SubtreeParams = { session: UserSession; productId: string };

const subtreeKey = ({ session, productId }: SubtreeParams): string => `${session.id}:${productId}`;

/**
 * The product subtree key for a pairing (RFC-0022), read from local persistence.
 *
 * This is an in-memory L1 over `repository.ts`; it performs NO wire I/O. A subtree key reaches
 * persistence only through `productAccountUseCase.requestProductSubtree`, whose caller is
 * responsible for surfacing the request — so no code path can reach the paired device without
 * the request being accounted for. A read with nothing stored THROWS rather than returning a
 * sentinel, so the miss is never cached and the next read retries once the key exists.
 *
 * `staleAfter: Infinity` — the key is immutable for the lifetime of a pairing. Keyed on the
 * session id as well as the product, so a re-pair cannot serve the previous identity's key. The
 * live `session` rides along as a parameter rather than part of the key — it is a handle, not a
 * value.
 */
export const productSubtreeResource = createQueryResource<SubtreeParams>({
  key: subtreeKey,
})
  .request<Uint8Array>(async ({ session, productId }) => {
    const persisted = await productSubtreeRepository.read(session.id, productId);
    if (!persisted) {
      throw new Error(`No subtree key stored for ${productId}; request it first`);
    }

    return persisted;
  })
  .cache<Record<string, Uint8Array>>({
    initial: {},
    staleAfter: Number.POSITIVE_INFINITY,
    map: (cache, subtreeKeyBytes, params) => ({ ...cache, [subtreeKey(params)]: subtreeKeyBytes }),
  })
  .build();
