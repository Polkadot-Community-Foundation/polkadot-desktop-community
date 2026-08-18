import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { productSubtreeRepository } from '../account/repository';
import { productSubtreeResource } from '../account/resource';

import { productAccountUseCase } from './account';

/**
 * The batch path is what every signing surface calls. It must cost ONE round trip to the paired
 * device no matter how many derivation indices are requested: `createQueryResource` does not share
 * an in-flight request between reads issued in the same tick (see `../account/resource.spec.ts`),
 * so fanning out per index would hit the device once per index on a cold cache.
 */

const fetchProductSubtree = vi.hoisted(() => vi.fn());
vi.mock('../account/gateway', () => ({ productAccountGateway: { fetchProductSubtree } }));

// A real sr25519 public key — soft derivation decodes it as a ristretto255 point, so an
// arbitrary 32-byte filler throws before the assertion is reached.
const SUBTREE_KEY = Uint8Array.from(Buffer.from('b8338463fa77d2c4afdceb1955914f84f76246d7672e6124ccbcd1789fcdfb5a', 'hex'));

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions -- test double
const session = (id: string) => ({ id }) as any;

describe('productAccountUseCase.getProductAccountAddresses', () => {
  beforeEach(async () => {
    productSubtreeResource.invalidateAll();
    await productSubtreeRepository.clearAll();
    fetchProductSubtree.mockReset();
    fetchProductSubtree.mockResolvedValue(SUBTREE_KEY);
    // The batch path no longer fetches on its own — the key must already be persisted.
    await productAccountUseCase.requestProductSubtree(session('s1'), 'p.dot');
    fetchProductSubtree.mockClear();
  });

  it('reads the subtree key once for a multi-index batch', async () => {
    const indices = [0, 1, 2, 3].map(value => ({ tag: 'Index' as const, value }));

    const addresses = await productAccountUseCase.getProductAccountAddresses(session('s1'), 'p.dot', indices);

    expect(addresses).toHaveLength(4);
    expect(fetchProductSubtree).not.toHaveBeenCalled();
  });

  it('returns an empty array for an empty batch without reading the subtree key', async () => {
    productSubtreeResource.invalidateAll();
    await productSubtreeRepository.clearAll();

    await expect(productAccountUseCase.getProductAccountAddresses(session('s1'), 'p.dot', [])).resolves.toEqual([]);
  });

  it('returns addresses in the order requested', async () => {
    const indices = [7, 2].map(value => ({ tag: 'Index' as const, value }));

    const [first, second] = await productAccountUseCase.getProductAccountAddresses(session('s1'), 'p.dot', indices);
    const [alone] = await productAccountUseCase.getProductAccountAddresses(session('s1'), 'p.dot', [indices[1]!]);

    expect(second).toBe(alone);
    expect(first).not.toBe(second);
  });
});

describe('productAccountUseCase subtree access', () => {
  beforeEach(async () => {
    productSubtreeResource.invalidateAll();
    await productSubtreeRepository.clearAll();
    fetchProductSubtree.mockReset();
    fetchProductSubtree.mockResolvedValue(SUBTREE_KEY);
  });

  it('readPersistedProductSubtree returns null and performs no wire call when nothing is stored', async () => {
    await expect(productAccountUseCase.readPersistedProductSubtree(session('s1'), 'p.dot')).resolves.toBeNull();
    expect(fetchProductSubtree).not.toHaveBeenCalled();
  });

  it('requestProductSubtree fetches once and persists the subtree key', async () => {
    await productAccountUseCase.requestProductSubtree(session('s1'), 'p.dot');

    expect(fetchProductSubtree).toHaveBeenCalledTimes(1);
    await expect(productAccountUseCase.readPersistedProductSubtree(session('s1'), 'p.dot')).resolves.toEqual(SUBTREE_KEY);
  });

  it('persists nothing when the request fails, so the next attempt re-asks', async () => {
    fetchProductSubtree.mockRejectedValueOnce(new Error('rejected on device'));

    await expect(productAccountUseCase.requestProductSubtree(session('s1'), 'p.dot')).rejects.toThrow('rejected on device');
    await expect(productAccountUseCase.readPersistedProductSubtree(session('s1'), 'p.dot')).resolves.toBeNull();
  });

  it('getProductAccountAddresses rejects when no subtree key has been requested yet', async () => {
    const indices = [{ tag: 'Index' as const, value: 0 }];

    await expect(productAccountUseCase.getProductAccountAddresses(session('s1'), 'p.dot', indices)).rejects.toThrow();
    expect(fetchProductSubtree).not.toHaveBeenCalled();
  });

  it('clearPersistedProductSubtrees drops the stored key', async () => {
    await productAccountUseCase.requestProductSubtree(session('s1'), 'p.dot');

    await productAccountUseCase.clearPersistedProductSubtrees();

    await expect(productAccountUseCase.readPersistedProductSubtree(session('s1'), 'p.dot')).resolves.toBeNull();
  });
});
