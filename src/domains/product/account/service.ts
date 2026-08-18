import { type CodecType, type DerivationIndex, type ProductAccountId } from '@novasamatech/host-api';
import { derivationIndexBytes } from '@novasamatech/host-container';
import { toHex } from '@polkadot-api/utils';
import { HDKD } from '@scure/sr25519';

import { EXECUTABLE_KINDS } from '../product/manifest/constants';

// Leading executable-subname label (`app.`, `widget.`, `worker.`) — see `stripExecutableSubname`.
const EXECUTABLE_SUBNAME_PREFIX = new RegExp(`^(?:${EXECUTABLE_KINDS.join('|')})\\.`, 'i');

/**
 * Soft-derive `/{index}` under `//product//{productId}` (RFC-0022). The two product
 * junctions are hard, so the subtree key comes from the paired device.
 *
 * The chain code is the 32-byte derivation index, not a path segment — `polkadot-js`
 * and `subkey` cannot express this path.
 */
function deriveProductAccountPublicKey(
  productSubtreeKey: Uint8Array,
  derivationIndex: CodecType<typeof DerivationIndex>,
): Uint8Array {
  return HDKD.publicSoft(productSubtreeKey, derivationIndexBytes(derivationIndex));
}

/** Stable identifier for a selector: the number for `Index`, hex for `Raw`. */
function formatDerivationIndex(derivationIndex: CodecType<typeof DerivationIndex>): string {
  return derivationIndex.tag === 'Index' ? String(derivationIndex.value) : toHex(derivationIndex.value);
}

/**
 * The account's derivation path as RFC-0022 defines it: `//product//{productId}/{index}`.
 *
 * `//product` and `//{productId}` are HARD junctions, `/{index}` is soft — the separators
 * carry that meaning and are not decoration. Rendering `{productId}/{index}` (as the signing
 * modals each did inline) drops the namespace junction and demotes the product junction to
 * soft, which describes a different key than the one being signed with.
 *
 * Display only. The path is not reproducible in `polkadot-js` or `subkey`: the leaf chain code
 * is the 32-byte derivation index (`u32 LE ++ INDEX_MAGIC`), not the path segment `{index}`.
 */
function formatDerivationPath([productId, derivationIndex]: CodecType<typeof ProductAccountId>): string {
  return `//product//${productId}/${formatDerivationIndex(derivationIndex)}`;
}

// A product reports its account under its executable subname (`app.<base>`,
// `widget.<base>`, `worker.<base>`), but accounts are derived off the bare
// product base name so every executable of one product shares a single account.
// Strip the executable label — but only when a valid base name (`<label>.dot`,
// i.e. 2+ labels) remains, so a product literally named `app.dot` is left as-is.
// Localhost / non-`.dot` identifiers carry no subname and pass through unchanged.
function stripExecutableSubname(productId: string): string {
  const withoutSubname = productId.replace(EXECUTABLE_SUBNAME_PREFIX, '');
  const isValidBaseName = withoutSubname.split('.').length >= 2;

  return isValidBaseName ? withoutSubname : productId;
}

function normalizeProductAccountId([productId, index]: CodecType<typeof ProductAccountId>): CodecType<typeof ProductAccountId> {
  return [stripExecutableSubname(productId), index];
}

/**
 * Does `ownerProductId` name the same product as `callingProductId`?
 *
 * Both sides go through `stripExecutableSubname`: a product reports itself under its executable
 * subname (`app.foo.dot`) while a ring VRF key handle names the bare base (`foo.dot`), so a raw
 * string comparison reads a product's own key as foreign.
 */
function isOwnedBy(ownerProductId: string, callingProductId: string): boolean {
  return stripExecutableSubname(ownerProductId) === stripExecutableSubname(callingProductId);
}

export const productAccountService = {
  deriveProductAccountPublicKey,
  formatDerivationIndex,
  formatDerivationPath,
  isOwnedBy,
  normalizeProductAccountId,
};
