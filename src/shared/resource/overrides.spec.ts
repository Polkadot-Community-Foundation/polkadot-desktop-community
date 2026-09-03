import { Subject, firstValueFrom } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { createQueryResource } from './createQueryResource';
import { createStreamResource } from './createStreamResource';
import { resetResourceOverrides } from './overrides';

const realRequest = vi.fn((params: { id: number }) => Promise.resolve(`real-${params.id}`));

const queryResource = createQueryResource<{ id: number }>({ key: ({ id }) => `q-${id}` })
  .request<string>(realRequest)
  .cache<Record<string, string>>({
    initial: {},
    staleAfter: Number.POSITIVE_INFINITY,
    map: (cache, value, { id }) => ({ ...cache, [`q-${id}`]: value }),
  })
  .build();

function read(id: number) {
  return firstValueFrom(queryResource.read$({ id }));
}

describe('resource.instead', () => {
  it('serves the override instead of the real request', async () => {
    queryResource.instead(({ id }) => `fake-${id}`);

    await expect(read(1)).resolves.toBe('fake-1');
    expect(realRequest).not.toHaveBeenCalled();
  });

  // The failure mode this exists to prevent: without invalidating on override,
  // a resource that has already read something serves the OLD value and the
  // override silently does nothing. `staleAfter: Infinity` is common here, so
  // this would be the default experience rather than an edge case.
  it('takes effect even when the real request already cached a value', async () => {
    await expect(read(2)).resolves.toBe('real-2');

    queryResource.instead(({ id }) => `fake-${id}`);

    await expect(read(2)).resolves.toBe('fake-2');
  });

  it('supports a per-case answer, including a rejection', async () => {
    queryResource.instead(() => Promise.reject(new Error('boom')));

    await expect(read(3)).rejects.toThrow('boom');
  });

  it('restores the real request on reset, and drops what the override cached', async () => {
    queryResource.instead(({ id }) => `fake-${id}`);
    await expect(read(4)).resolves.toBe('fake-4');

    resetResourceOverrides();

    await expect(read(4)).resolves.toBe('real-4');
  });

  it('leaves a resource that was never overridden untouched', async () => {
    await expect(read(5)).resolves.toBe('real-5');
    const before = queryResource.snapshot();

    resetResourceOverrides();

    // A reset must not clear caches of resources nobody overrode — otherwise
    // every test would pay for one test's override.
    expect(queryResource.snapshot()).toBe(before);
  });
});

describe('resource.instead — stream resources', () => {
  it('swaps the subscription factory', async () => {
    const upstream = new Subject<string>();
    const streamResource = createStreamResource<{ id: number }>({ key: ({ id }) => `s-${id}` })
      .subscribe<string>(() => upstream.asObservable())
      .cache<Record<string, string>>({
        initial: {},
        map: (cache, value, { id }) => ({ ...cache, [`s-${id}`]: value }),
      })
      .build();

    const fake = new Subject<string>();
    streamResource.instead(() => fake.asObservable());

    const first = firstValueFrom(streamResource.read$({ id: 1 }));
    fake.next('from-override');

    await expect(first).resolves.toBe('from-override');
  });
});
