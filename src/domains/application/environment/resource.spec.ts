import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type Chain } from '@/domains/network';
import { REMOTE_CONFIG_KEYS, remoteConfigGateway } from '@/domains/remote-config';

import { environmentsConfig } from './constants';
import { environmentResource } from './resource';
import { type EnvironmentId } from './types';

// The channel catalog is compile-time (`VITE_ENVIRONMENTS`), so drive the tests
// from whatever the build actually configured rather than a fabricated id.
const ACTIVE_ID = environmentsConfig.default;
const CHANNEL = environmentsConfig.channels[ACTIVE_ID];
if (!CHANNEL) throw new Error('[test] the default channel is missing from VITE_ENVIRONMENTS');

// `findRemoteChain` matches on `chainId`; the cache key digests `genesisHash`.
function chain(chainId: string, genesisHash: string): Chain {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- minimal fixture; only chainId, genesisHash and externalApi are read
  return { chainId, genesisHash, name: chainId, externalApi: {} } as never;
}

// A catalog that satisfies whatever role labels the active channel asks for.
function catalogFor(roles: { people: string; bulletin: string; assetHub: string }): Chain[] {
  const labels = [...new Set([roles.people, roles.bulletin, roles.assetHub])];

  return labels.map((label, index) => chain(label, `0x${String(index).padStart(4, '0')}`));
}

const DOTNS = { resolverContractAddress: 'aabb', registryContractAddress: 'ccdd' };

function stubRemoteConfig({ dotNs = DOTNS, ipfs = 'https://ipfs.example/', backend = 'https://api.example/' } = {}) {
  vi.spyOn(remoteConfigGateway, 'tryGetJson').mockImplementation(key => (key === REMOTE_CONFIG_KEYS.dotNsConfig ? dotNs : null));
  vi.spyOn(remoteConfigGateway, 'tryGetString').mockImplementation(key => {
    if (key === REMOTE_CONFIG_KEYS.ipfsGatewayUrl) return ipfs;
    if (key === REMOTE_CONFIG_KEYS.identityBackendUrl) return backend;

    return null;
  });
}

function read(chains: Chain[], id: EnvironmentId = ACTIVE_ID) {
  return firstValueFrom(environmentResource.read$({ id, chains }));
}

beforeEach(() => {
  environmentResource.invalidateAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('environmentResource', () => {
  it('assembles the environment from the catalog and Remote Config', async () => {
    stubRemoteConfig();

    const environment = await read(catalogFor(CHANNEL.roles));

    expect(environment.id).toBe(ACTIVE_ID);
    expect(environment.name).toBe(CHANNEL.name);
    expect(environment.dotnsContentResolverContract).toBe('0xaabb');
    expect(environment.dotnsRegistryContract).toBe('0xccdd');
    expect(environment.peopleChain.chainId).toBe(CHANNEL.roles.people);
    expect(environment.bulletinChain.chainId).toBe(CHANNEL.roles.bulletin);
    expect(environment.dotnsChain.chainId).toBe(CHANNEL.roles.assetHub);
    // No `externalApi.hop` on the fixture, so the fallback applies.
    expect(environment.bulletinHopEndpoints).toEqual([]);
    expect(environment.iosBundleId).toBe(CHANNEL.iosBundleId);
    expect(environment.botNetwork).toBe(CHANNEL.botNetwork);
    expect(environment.hostChatNetwork).toBe(CHANNEL.hostChatNetwork);
    expect(environment.digitalDollarAsset).toBe(CHANNEL.digitalDollarAsset);
  });

  // `src/bootstrap.ts` refreshes Remote Config and retries after a failed
  // assembly. That only works because a rejected request is never cached — if it
  // were, the retry would be served the failure under `staleAfter: Infinity`.
  it('does not cache a failed assembly, so a retry re-runs it', async () => {
    stubRemoteConfig({ ipfs: '' });
    const chains = catalogFor(CHANNEL.roles);

    await expect(read(chains)).rejects.toThrow();
    expect(environmentResource.snapshot()).toEqual({});

    vi.restoreAllMocks();
    stubRemoteConfig();

    await expect(read(chains)).resolves.toMatchObject({ id: ACTIVE_ID });
  });

  // Genesis hashes alone are not enough: the environment embeds whole Chain
  // objects, and reads HOP endpoints off `bulletinChain.externalApi`.
  it('re-assembles when a role chain keeps its genesis hash but changes endpoints', async () => {
    stubRemoteConfig();
    const chains = catalogFor(CHANNEL.roles);

    const first = await read(chains);
    const withHop = chains.map(entry =>
      entry.chainId === CHANNEL.roles.bulletin
        ? // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- fixture with the endpoint the environment reads
          ({ ...entry, externalApi: { hop: ['wss://hop.example'] } } as never)
        : entry,
    );
    const second = await read(withHop);

    expect(second).not.toBe(first);
    expect(second.bulletinHopEndpoints).toEqual(['wss://hop.example']);
  });

  it('strips trailing slashes off the backend and IPFS gateway URLs', async () => {
    stubRemoteConfig({ ipfs: 'https://ipfs.example///', backend: 'https://api.example//' });

    const environment = await read(catalogFor(CHANNEL.roles));

    expect(environment.ipfsGatewayUrl).toBe('https://ipfs.example');
    expect(environment.backendUrl).toBe('https://api.example');
  });

  it('throws for a channel that is not in the catalog', async () => {
    stubRemoteConfig();

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- deliberately unknown channel
    await expect(read(catalogFor(CHANNEL.roles), 'not-a-channel' as EnvironmentId)).rejects.toThrow('unknown channel');
  });

  it('throws when the catalog is missing a role chain', async () => {
    stubRemoteConfig();

    await expect(read([])).rejects.toThrow('missing a role');
  });

  it('throws when a Remote Config scalar is unavailable', async () => {
    stubRemoteConfig({ ipfs: '' });

    await expect(read(catalogFor(CHANNEL.roles))).rejects.toThrow('unavailable');
  });

  it('serves a repeat read from cache without re-reading Remote Config', async () => {
    stubRemoteConfig();
    const chains = catalogFor(CHANNEL.roles);

    const first = await read(chains);
    const callsAfterFirst = vi.mocked(remoteConfigGateway.tryGetJson).mock.calls.length;
    const second = await read(chains);

    expect(vi.mocked(remoteConfigGateway.tryGetJson).mock.calls).toHaveLength(callsAfterFirst);
    // Same object identity — consumers hold this across renders.
    expect(second).toBe(first);
  });

  // The catalog is part of the cache key: a refreshed `chainResource` must not be
  // served an environment assembled from the previous catalog.
  it('re-assembles when the chain catalog changes', async () => {
    stubRemoteConfig();

    const first = await read(catalogFor(CHANNEL.roles));
    const relabelled = catalogFor(CHANNEL.roles).map((entry, index) => chain(entry.chainId, `0xffff${index}`));
    const second = await read(relabelled);

    expect(second).not.toBe(first);
  });
});
