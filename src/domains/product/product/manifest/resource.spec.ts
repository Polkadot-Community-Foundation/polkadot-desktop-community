import { type BehaviorSubject, firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type HexString } from '@/shared/types';
import { archiveStoreGateway } from '../archive-store/gateway';
import { type Product } from '../types';

import { archiveGateway } from './gateway';
import { archiveCacheKey, executableArchiveResource, invalidateExecutableArchive, peekExecutableArchive } from './resource';
import { type ExecutableContent } from './types';

// The resource is a module singleton with `staleAfter: Infinity` and an internal
// request cache the `afterEach` below does not reach. Only `invalidateAll` clears
// it, so without this a second read for the same key is served from that cache and
// never touches the gateways — making the spy assertions pass for the wrong reason.
beforeEach(() => {
  executableArchiveResource.invalidateAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- cache$ is a BehaviorSubject internally; cast is safe in tests (see types.ts note)
const archiveCache$ = executableArchiveResource.cache$ as BehaviorSubject<Record<string, ExecutableContent | null>>;

const HASH_A: HexString = '0xaabb';
const HASH_B: HexString = '0xccdd';

describe('archiveCacheKey', () => {
  it('produces distinct keys for the same (baseName, kind) with different contenthashes', () => {
    const key1 = archiveCacheKey('a.dot', 'app', HASH_A);
    const key2 = archiveCacheKey('a.dot', 'app', HASH_B);
    expect(key1).not.toBe(key2);
  });

  it('produces distinct keys for the same (baseName, contenthash) with different kinds', () => {
    const keyApp = archiveCacheKey('a.dot', 'app', HASH_A);
    const keyWorker = archiveCacheKey('a.dot', 'worker', HASH_A);
    expect(keyApp).not.toBe(keyWorker);
  });

  it('produces distinct keys for the same (kind, contenthash) with different baseNames', () => {
    const key1 = archiveCacheKey('a.dot', 'app', HASH_A);
    const key2 = archiveCacheKey('b.dot', 'app', HASH_A);
    expect(key1).not.toBe(key2);
  });

  it('produces the same key for the same (baseName, kind, contenthash)', () => {
    const key1 = archiveCacheKey('a.dot', 'app', HASH_A);
    const key2 = archiveCacheKey('a.dot', 'app', HASH_A);
    expect(key1).toBe(key2);
  });
});

describe('invalidateExecutableArchive', () => {
  it('is callable with a contenthash without throwing', () => {
    expect(() => {
      invalidateExecutableArchive('a.dot', 'app', HASH_A);
    }).not.toThrow();
  });

  it('is callable without a contenthash (prefix-eviction form) without throwing', () => {
    expect(() => {
      invalidateExecutableArchive('a.dot', 'app');
    }).not.toThrow();
  });
});

describe('peekExecutableArchive', () => {
  afterEach(() => {
    // Reset the shared resource cache so seeded entries don't leak across tests.
    archiveCache$.next({});
  });

  it('returns null when nothing is cached for the product/kind', () => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- minimal fixture, only baseName + executables[kind].contenthash are read
    const product = { baseName: 'none.dot', executables: { app: { contenthash: '0xaa' } } } as never;
    expect(peekExecutableArchive(product, 'app')).toBeNull();
  });

  it('returns null when the executable kind is absent', () => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- minimal fixture for the absent-kind branch
    const product = { baseName: 'none.dot', executables: {} } as never;
    expect(peekExecutableArchive(product, 'worker')).toBeNull();
  });

  it('returns null when the cached entry has no bytes (disk-hit files: {})', () => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- minimal fixture
    const product = { baseName: 'a.dot', executables: { app: { contenthash: '0xaa' } } } as never;
    archiveCache$.next({
      [archiveCacheKey('a.dot', 'app', '0xaa')]: {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- narrowing string literal to HexString for the fixture
        contenthash: '0xaa' as `0x${string}`,
        archive: { domain: 'app.a.dot', origin: 'polkadot://app.a.dot', files: {} },
      },
    });
    expect(peekExecutableArchive(product, 'app')).toBeNull();
  });

  it('returns the cached entry when bytes are present', () => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- minimal fixture
    const product = { baseName: 'a.dot', executables: { app: { contenthash: '0xaa' } } } as never;
    const entry = {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- narrowing string literal to HexString for the fixture
      contenthash: '0xaa' as `0x${string}`,
      archive: { domain: 'app.a.dot', origin: 'polkadot://app.a.dot', files: { 'index.html': new Uint8Array([1]) } },
    };
    archiveCache$.next({ [archiveCacheKey('a.dot', 'app', '0xaa')]: entry });
    expect(peekExecutableArchive(product, 'app')).toEqual(entry);
  });
});
const GATEWAY_A = 'https://gateway-a.example';
const GATEWAY_B = 'https://gateway-b.example';

const loadProduct: Product = {
  baseName: 'app.dot',
  displayName: 'App',
  description: '',
  icon: { cid: '', format: 'png' },
  executables: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test fixture executable
    app: {
      kind: 'app',
      identifier: 'app.app.dot',
      appVersion: [0, 0, 0],
      contenthash: '0xaa',
    } as never,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test fixture executable
    widget: {
      kind: 'widget',
      identifier: 'widget.app.dot',
      appVersion: [0, 0, 0],
      contenthash: '0xcc',
    } as never,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test fixture executable
    worker: {
      kind: 'worker',
      identifier: 'worker.app.dot',
      appVersion: [0, 0, 0],
      contenthash: '0xbb',
    } as never,
  },
};

function read(kind: 'app' | 'widget' | 'worker', ipfsGatewayUrl = GATEWAY_A) {
  return firstValueFrom(
    executableArchiveResource.read$({
      product: loadProduct,
      kind,
      ipfsGatewayUrl,
    }),
  );
}

describe('executableArchiveResource — offline-first load', () => {
  it('serves a worker from the disk store without fetching', async () => {
    vi.spyOn(archiveStoreGateway, 'has').mockResolvedValue(true);
    vi.spyOn(archiveStoreGateway, 'get').mockResolvedValue({
      origin: 'polkadot://worker.app.dot',
      files: { 'index.js': new Uint8Array([7]) },
    });
    const fetchSpy = vi.spyOn(archiveGateway, 'fetchExecutable');

    const result = await read('worker');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result?.archive.files['index.js']).toEqual(new Uint8Array([7]));
  });

  it('serves an app from the disk store with empty files (main serves it over polkadot://)', async () => {
    vi.spyOn(archiveStoreGateway, 'has').mockResolvedValue(true);
    const fetchSpy = vi.spyOn(archiveGateway, 'fetchExecutable');

    const result = await read('app');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result?.archive.files).toEqual({});
    expect(result?.archive.origin).toBeTruthy();
  });

  it('fetches with the gateway URL it was given on a disk miss', async () => {
    vi.spyOn(archiveStoreGateway, 'has').mockResolvedValue(false);
    vi.spyOn(archiveStoreGateway, 'warm').mockResolvedValue({ success: true });
    const fetchSpy = vi.spyOn(archiveGateway, 'fetchExecutable').mockResolvedValue({
      contenthash: '0xaa',
      archive: {
        domain: 'app.app.dot',
        origin: 'polkadot://app.app.dot',
        files: { 'index.html': new Uint8Array([1]) },
      },
    });

    await read('app', GATEWAY_B);

    expect(fetchSpy).toHaveBeenCalledWith(loadProduct, 'app', GATEWAY_B);
  });

  it('warms main for an app on a disk miss', async () => {
    vi.spyOn(archiveStoreGateway, 'has').mockResolvedValue(false);
    const warm = vi.spyOn(archiveStoreGateway, 'warm').mockResolvedValue({ success: true });
    vi.spyOn(archiveGateway, 'fetchExecutable').mockResolvedValue({
      contenthash: '0xaa',
      archive: {
        domain: 'app.app.dot',
        origin: 'polkadot://app.app.dot',
        files: { 'index.html': new Uint8Array([1]) },
      },
    });

    await read('app');

    expect(warm).toHaveBeenCalledTimes(1);
  });

  it('warms main for a widget on a disk miss', async () => {
    vi.spyOn(archiveStoreGateway, 'has').mockResolvedValue(false);
    const warm = vi.spyOn(archiveStoreGateway, 'warm').mockResolvedValue({ success: true });
    vi.spyOn(archiveGateway, 'fetchExecutable').mockResolvedValue({
      contenthash: '0xcc',
      archive: {
        domain: 'widget.app.dot',
        origin: 'polkadot://widget.app.dot',
        files: { 'index.html': new Uint8Array([1]) },
      },
    });

    await read('widget');

    expect(warm).toHaveBeenCalledTimes(1);
  });

  it('does NOT warm main for a worker on a disk miss (worker runs in the renderer)', async () => {
    vi.spyOn(archiveStoreGateway, 'has').mockResolvedValue(false);
    const warm = vi.spyOn(archiveStoreGateway, 'warm').mockResolvedValue({ success: true });
    vi.spyOn(archiveGateway, 'fetchExecutable').mockResolvedValue({
      contenthash: '0xbb',
      archive: {
        domain: 'worker.app.dot',
        origin: 'polkadot://worker.app.dot',
        files: { 'index.js': new Uint8Array([1]) },
      },
    });

    const result = await read('worker');

    expect(warm).not.toHaveBeenCalled();
    expect(result?.archive.files['index.js']).toEqual(new Uint8Array([1]));
  });

  it('throws when warming main fails', async () => {
    vi.spyOn(archiveStoreGateway, 'has').mockResolvedValue(false);
    vi.spyOn(archiveStoreGateway, 'warm').mockResolvedValue({
      success: false,
      error: 'boom',
    });
    vi.spyOn(archiveGateway, 'fetchExecutable').mockResolvedValue({
      contenthash: '0xaa',
      archive: {
        domain: 'app.app.dot',
        origin: 'polkadot://app.app.dot',
        files: { 'index.html': new Uint8Array([1]) },
      },
    });

    await expect(read('app')).rejects.toThrow('Failed to register product');
  });

  // The key is content-addressed, so the gateway URL is deliberately not part of it:
  // the same contenthash is the same bytes whoever served them.
  it('shares one cache entry across different gateway URLs', async () => {
    vi.spyOn(archiveStoreGateway, 'has').mockResolvedValue(false);
    vi.spyOn(archiveStoreGateway, 'warm').mockResolvedValue({ success: true });
    const fetchSpy = vi.spyOn(archiveGateway, 'fetchExecutable').mockResolvedValue({
      contenthash: '0xaa',
      archive: {
        domain: 'app.app.dot',
        origin: 'polkadot://app.app.dot',
        files: { 'index.html': new Uint8Array([1]) },
      },
    });

    await read('app', GATEWAY_A);
    await read('app', GATEWAY_B);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(Object.keys(executableArchiveResource.snapshot())).toHaveLength(1);
  });
});
