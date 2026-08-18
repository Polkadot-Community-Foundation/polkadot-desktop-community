/**
 * Pure helpers over peer/contact search results.
 */

import { AccountId } from '@polkadot-api/substrate-bindings';

import { p2pService } from '../service';
import { type SearchResult } from '../types';

// Decode any SS58 address to its 32-byte public key. The codec validates the
// checksum and length but ignores the network prefix on decode, so the match
// holds regardless of which SS58 format the backend minted `candidateAccountId`
// in.
const ss58ToPublicKey = AccountId().enc;

/**
 * Remove the current user's own account from contact search results.
 *
 * A username search resolves against the user's **identity** account (the
 * account a username is registered under on-chain), so a search for the current
 * user's own username returns their identity account. Self-chats are not a
 * supported flow, so that entry is dropped here.
 *
 * `selfIdentityPublicKey` is the raw 32-byte sr25519 identity public key
 * (`userIdentity.identitySr25519PublicKey`) — NOT the per-device statement
 * account. The username is registered under the identity account, so comparing
 * against the statement account never matches and self leaks into results.
 * Comparison is on decoded public-key bytes, so it is independent of the SS58
 * prefix.
 */
function excludeSelfFromSearchResults(results: SearchResult[], selfIdentityPublicKey: Uint8Array): SearchResult[] {
  return results.filter(result => !p2pService.bytesEqual(ss58ToPublicKey(result.candidateAccountId), selfIdentityPublicKey));
}

export const peerSearchService = {
  excludeSelfFromSearchResults,
};
