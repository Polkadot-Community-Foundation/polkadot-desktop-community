import { firstValueFrom } from 'rxjs';

import { type Environment } from '@/domains/application';

import { dotNsTldResource } from './resource';

const { readTld } = vi.hoisted(() => ({ readTld: vi.fn() }));

vi.mock('./gateway', () => ({ dotNsGateway: { readTld } }));

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test fixture, not production code
const environment = {
  id: 'paseo',
  dotnsChain: { chainId: '0x01' },
  dotnsRegistryContract: '0xf34054fd76BbF85f216cf9908226D5f0A72E50CA',
} as unknown as Environment;

describe('dotNsTldResource', () => {
  beforeEach(() => {
    readTld.mockReset();
  });

  test('passes through the TLD the network reports', async () => {
    readTld.mockResolvedValue('.paseo');

    await expect(firstValueFrom(dotNsTldResource.read$({ environment }))).resolves.toBe('.paseo');
  });

  test('falls back to .dot when the network reports none', async () => {
    readTld.mockResolvedValue(null);

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- narrowing the mocked chain to a fresh cache key
    const other = { ...environment, dotnsChain: { chainId: '0x02' } } as unknown as Environment;

    await expect(firstValueFrom(dotNsTldResource.read$({ environment: other }))).resolves.toBe('.dot');
  });
});
