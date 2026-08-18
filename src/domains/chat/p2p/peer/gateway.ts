/**
 * Peer resolution for P2P chat — username search and chat-key lookup, both served
 * by host-chat's AccountService.
 *
 * `getConsumerInfo` returns the whole on-chain identity, `identifierKey` included
 * (the SDK unwraps it from its RFC-0004 container), so nothing here
 * reads `Resources.Consumers` or touches key material itself.
 */

import { type IdentitySource, createAccountService } from '@novasamatech/host-chat';
import { fromHex } from 'polkadot-api/utils';

import { type SearchResult } from '../types';

function createPeerResolver(identity: IdentitySource, backendUrl: string) {
  const accountService = createAccountService({
    identityEndpoint: new URL('/api/v1', backendUrl).toString(),
    identity,
  });

  const getIdentity = async (address: string) => {
    const result = await accountService.getConsumerInfo(address);
    if (result.isErr()) {
      console.warn('[peer-resolver] identity lookup failed for %s (%s)', address, result.error.message);

      return null;
    }

    return result.value;
  };

  return {
    async searchUsers(query: string): Promise<SearchResult[]> {
      const result = await accountService.search(query, 'ASSIGNED');
      if (result.isErr()) {
        throw result.error;
      }

      return result.value;
    },

    async getPeerChatKey(address: string): Promise<Uint8Array | null> {
      const identity = await getIdentity(address);
      if (!identity?.identifierKey) {
        console.warn('[peer-resolver] no chat key resolved for %s', address);

        return null;
      }

      return fromHex(identity.identifierKey);
    },

    async getUsername(address: string): Promise<string | null> {
      const identity = await getIdentity(address);
      if (!identity) return null;

      return identity.fullUsername ?? identity.liteUsername;
    },

    async getPeerContact(address: string): Promise<{ chatKey: Uint8Array; username: string } | null> {
      const identity = await getIdentity(address);
      if (!identity?.identifierKey) return null;

      const username = identity.fullUsername ?? identity.liteUsername;
      if (!username) return null;

      return { chatKey: fromHex(identity.identifierKey), username };
    },
  };
}

export const peerGateway = {
  createPeerResolver,
};
