import 'fake-indexeddb/auto';

import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { productSubtreeRepository } from './repository';
import { productSubtreeResource } from './resource';

/**
 * The resource is an in-memory L1 over the repository and performs NO wire I/O — a subtree key
 * reaches persistence only through `productAccountUseCase.requestProductSubtree`. The miss path is
 * the one worth pinning: it must THROW rather than caching a sentinel, so the read retries once the
 * key exists instead of serving the miss forever.
 */

// Only `id` is read by the resource key; the rest of UserSession never reaches it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions -- test double
const session = (id: string) => ({ id }) as any;

describe('productSubtreeResource', () => {
  beforeEach(async () => {
    productSubtreeResource.invalidateAll();
    await productSubtreeRepository.clearAll();
  });

  it('throws when no subtree key has been persisted', async () => {
    const params = { session: session('s1'), productId: 'p.dot' };

    await expect(firstValueFrom(productSubtreeResource.read$(params))).rejects.toThrow('No subtree key stored');
  });

  it('does not cache the miss — a later read serves the key once it is persisted', async () => {
    const params = { session: session('s1'), productId: 'p.dot' };
    await expect(firstValueFrom(productSubtreeResource.read$(params))).rejects.toThrow();

    await productSubtreeRepository.write('s1', 'p.dot', new Uint8Array(32).fill(7));

    await expect(firstValueFrom(productSubtreeResource.read$(params))).resolves.toEqual(new Uint8Array(32).fill(7));
  });

  it('serves repeat reads for the same session+product from cache', async () => {
    await productSubtreeRepository.write('s1', 'p.dot', new Uint8Array(32).fill(1));
    const params = { session: session('s1'), productId: 'p.dot' };

    await firstValueFrom(productSubtreeResource.read$(params));
    // Clearing persistence proves the second read never reached the repository.
    await productSubtreeRepository.clearAll();

    await expect(firstValueFrom(productSubtreeResource.read$(params))).resolves.toEqual(new Uint8Array(32).fill(1));
  });

  it('does not serve a previous pairing key after a re-pair', async () => {
    await productSubtreeRepository.write('s1', 'p.dot', new Uint8Array(32).fill(1));
    await firstValueFrom(productSubtreeResource.read$({ session: session('s1'), productId: 'p.dot' }));

    await productSubtreeRepository.write('s2', 'p.dot', new Uint8Array(32).fill(2));
    const afterRepair = await firstValueFrom(productSubtreeResource.read$({ session: session('s2'), productId: 'p.dot' }));

    expect(afterRepair).toEqual(new Uint8Array(32).fill(2));
  });
});
