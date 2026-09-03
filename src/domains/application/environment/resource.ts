import { type HexString } from '@novasamatech/scale';

import { createQueryResource } from '@/shared/resource';
import { type Chain, chainService } from '@/domains/network';
import { REMOTE_CONFIG_KEYS, remoteConfigGateway, remoteUrlSchema } from '@/domains/remote-config';

import { environmentsConfig } from './constants';
import { dotNsConfigSchema } from './schemas';
import { type Environment, type EnvironmentId } from './types';

type Params = { id: EnvironmentId; chains: Chain[] };

function ensure0x(address: string): HexString {
  return `0x${address.replace(/^0x/i, '')}`;
}

// The catalog is part of the identity: the same channel resolves different role
// chains from a different catalog, so a refreshed `chainResource` must key to a
// new entry rather than serve the environment assembled from the old one.
//
// The digest covers the three role chains in full, not just their genesis hashes.
// The assembled `Environment` embeds those whole `Chain` objects — including
// `bulletinChain.externalApi.hop`, which the HOP endpoints are read from — so two
// catalog revisions sharing a genesis hash but differing in endpoints are
// genuinely different environments and must not collide.
//
// A single string, not an array: `wrapKeyFactory` sorts array keys, which would
// make the id and the chain digests interchangeable in the joined result.
function environmentCacheKey({ id, chains }: Params): string {
  const roles = environmentsConfig.channels[id]?.roles;
  if (!roles) return `${id}:unknown-channel`;

  const digest = [roles.people, roles.bulletin, roles.assetHub]
    .map(label => JSON.stringify(chainService.findRemoteChain(chains, label) ?? null))
    .join('|');

  return `${id}:${digest}`;
}

// Assembles the `Environment`. Channel-shaped values come from `VITE_ENVIRONMENTS`;
// role chains are resolved out of the catalog passed in as a parameter (the network
// domain's single `chainResource`, NOT a second `chains_v2` parse); the remaining
// scalars (dotNS / ipfs / identity) from the Remote Config gateway.
//
// There is no bundled fallback — a missing piece throws. A rejected request is
// never cached, which is what lets `src/bootstrap.ts` refresh Remote Config and
// retry.
export const environmentResource = createQueryResource<Params>({
  key: environmentCacheKey,
})
  // Synchronous: every async part of the old assembly was the chain fetch, which
  // is now a parameter. `RequestFn` accepts a plain value.
  .request<Environment>(({ id, chains }) => {
    const channel = environmentsConfig.channels[id];
    if (!channel) throw new Error(`[environment] unknown channel "${id}" (not in VITE_ENVIRONMENTS)`);
    const roles = channel.roles;

    const peopleChain = chainService.findRemoteChain(chains, roles.people);
    const bulletinChain = chainService.findRemoteChain(chains, roles.bulletin);
    const dotnsChain = chainService.findRemoteChain(chains, roles.assetHub);
    if (!peopleChain || !bulletinChain || !dotnsChain) {
      throw new Error(`[environment] Remote Config chains for "${id}" are missing a role (people/bulletin/assetHub)`);
    }

    const dotNs = remoteConfigGateway.tryGetJson(REMOTE_CONFIG_KEYS.dotNsConfig, dotNsConfigSchema);
    const ipfsGatewayUrl = remoteConfigGateway.tryGetString(REMOTE_CONFIG_KEYS.ipfsGatewayUrl, remoteUrlSchema);
    const backendUrl = remoteConfigGateway.tryGetString(REMOTE_CONFIG_KEYS.identityBackendUrl, remoteUrlSchema);
    if (!dotNs || !ipfsGatewayUrl || !backendUrl) {
      throw new Error(`[environment] Remote Config scalars (dotNS/ipfs/identity) unavailable for "${id}"`);
    }

    return {
      id,
      name: channel.name,
      peopleChain,
      bulletinChain,
      bulletinHopEndpoints: bulletinChain.externalApi?.hop ?? [],
      dotnsChain,
      dotnsContentResolverContract: ensure0x(dotNs.resolverContractAddress),
      dotnsRegistryContract: ensure0x(dotNs.registryContractAddress),
      // RC stores the identity backend with a trailing slash; consumers append
      // `/api/...`, so normalize it off.
      backendUrl: backendUrl.replace(/\/+$/, ''),
      iosBundleId: channel.iosBundleId,
      ipfsGatewayUrl: ipfsGatewayUrl.replace(/\/+$/, ''),
      botNetwork: channel.botNetwork,
      hostChatNetwork: channel.hostChatNetwork,
      digitalDollarAsset: channel.digitalDollarAsset,
    };
  })
  .cache<Record<string, Environment>>({
    initial: {},
    // Remote Config activates once at bootstrap, so an assembled environment is
    // stable for as long as its catalog is. A new catalog changes the key.
    staleAfter: Number.POSITIVE_INFINITY,
    map: (cache, environment, params) => ({ ...cache, [environmentCacheKey(params)]: environment }),
  })
  .build();
