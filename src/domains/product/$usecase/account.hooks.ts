import { type CodecType, type DerivationIndex } from '@novasamatech/host-api';
import { type UserSession } from '@novasamatech/host-papp';

import { useRead } from '@/shared/hooks';
import { productAccountService } from '../account/service';

import { productAccountUseCase } from './account';

type AddressesParams = {
  session: UserSession;
  productId: string;
  derivationIndices: CodecType<typeof DerivationIndex>[];
};

// `params` holds a live session and binary selectors, which `JSON.stringify` handles
// poorly (methods dropped, blobs expensive) — key on the session id and rendered selectors.
const addressesKey = ({ session, productId, derivationIndices }: AddressesParams): string =>
  `${session.id}:${productId}:${derivationIndices.map(productAccountService.formatDerivationIndex).join(',')}`;

const readAddresses = ({ session, productId, derivationIndices }: AddressesParams) =>
  productAccountUseCase.getProductAccountAddresses(session, productId, derivationIndices);

/**
 * Resolve product account addresses. Async (RFC-0022) — the subtree key
 * comes from the paired device, cached after the first hit. Render a pending state
 * until `data` arrives; a placeholder address on a signing screen is worse than none.
 */
export const useProductAccountAddresses = (
  session: Nullable<UserSession>,
  productId: string,
  derivationIndices: CodecType<typeof DerivationIndex>[],
) => {
  return useRead(readAddresses, {
    // `null` params keep the read idle. Consumers pass `null` until the subtree key is
    // known to exist: `useRead` fires once per key and latches a rejection, so a read
    // issued before the key is stored would fail permanently and never retry.
    params: session ? { session, productId, derivationIndices } : null,
    key: addressesKey,
  });
};

/** Single-account convenience wrapper over {@link useProductAccountAddresses}. */
export const useProductAccountAddress = (
  session: Nullable<UserSession>,
  productId: string,
  derivationIndex: CodecType<typeof DerivationIndex>,
) => {
  const { data, ...rest } = useProductAccountAddresses(session, productId, [derivationIndex]);

  return { ...rest, data: data?.[0] };
};
