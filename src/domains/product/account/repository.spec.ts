import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';

import { database } from '@/shared/database';

import { productSubtreeRepository } from './repository';

const KEY = new Uint8Array(32).fill(0x2a);

describe('productSubtreeRepository', () => {
  beforeEach(async () => {
    await database.productSubtrees.clear();
  });

  it('returns null for a subtree key that was never written', async () => {
    await expect(productSubtreeRepository.read('s1', 'demo.dot')).resolves.toBeNull();
  });

  it('round-trips a written subtree key', async () => {
    await productSubtreeRepository.write('s1', 'demo.dot', KEY);

    await expect(productSubtreeRepository.read('s1', 'demo.dot')).resolves.toEqual(KEY);
  });

  it('scopes the subtree key to the session', async () => {
    await productSubtreeRepository.write('s1', 'demo.dot', KEY);

    await expect(productSubtreeRepository.read('s2', 'demo.dot')).resolves.toBeNull();
  });

  it('clearAll removes every persisted subtree key', async () => {
    await productSubtreeRepository.write('s1', 'demo.dot', KEY);

    await productSubtreeRepository.clearAll();

    await expect(productSubtreeRepository.read('s1', 'demo.dot')).resolves.toBeNull();
  });
});

describe('productSubtreeRepository — malformed rows', () => {
  beforeEach(async () => {
    await database.productSubtrees.clear();
  });

  it('reads a wrong-width subtree key as a miss and drops the row', async () => {
    // Written by a build with a different key width, or hand-edited via DevTools.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- malformed on purpose
    await database.productSubtrees.put({
      key: 's1:demo.dot',
      sessionId: 's1',
      productId: 'demo.dot',
      subtreeKey: new Uint8Array(65).fill(4),
      createdAt: 1,
    } as any);

    await expect(productSubtreeRepository.read('s1', 'demo.dot')).resolves.toBeNull();
    // Dropped, so the gate's next request can replace it.
    await expect(database.productSubtrees.get('s1:demo.dot')).resolves.toBeUndefined();
  });

  it('reads a row missing a required column as a miss', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions -- malformed on purpose
    await database.productSubtrees.put({ key: 's1:demo.dot', sessionId: 's1', productId: 'demo.dot' } as any);

    await expect(productSubtreeRepository.read('s1', 'demo.dot')).resolves.toBeNull();
  });
});
