import { errAsync, okAsync } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/domains/application', () => ({
  environmentUseCase: { getActive: vi.fn(async () => ({ bulletinChain: { id: 'bulletin' } })) },
  lazyClient: { getClient: () => ({ getUnsafeApi: () => ({ query: {} }) }) },
}));
vi.mock('@/domains/network', () => ({
  chainRegistry: {
    requestApi: vi.fn(async (_chain, callback) => callback({ client: { getUnsafeApi: () => ({ query: {} }) } })),
  },
}));
vi.mock('@novasamatech/statement-store', () => ({
  ensureSubstrateSlotSr25519Ready: vi.fn(async () => undefined),
  deriveSlotAccountPublicKey: vi.fn(() => new Uint8Array(32).fill(1)),
}));
vi.mock('../allowance/gateway', () => ({
  allowanceGateway: { getBulletinAuthorization: vi.fn(), getStatementStoreSlots: vi.fn() },
}));

import { allowanceGateway } from '../allowance/gateway';

import { allowanceUseCase } from './allowance';

const PUBLIC_KEY = new Uint8Array(32).fill(1);
const SUFFICIENT_SNAPSHOT = {
  authorization: {
    extent: { transactions: 0, transactionsAllowance: 5, bytes: 0n, bytesAllowance: 100n },
    expiration: 1000,
  },
  currentBlock: 10,
};
const session = { readAllowance: vi.fn() };
const PARAMS = { session, productId: 'p1' };

describe('checkResourcesSufficiency', () => {
  beforeEach(() => {
    session.readAllowance.mockReturnValue(okAsync(new Uint8Array(64).fill(2)));
    vi.mocked(allowanceGateway.getBulletinAuthorization).mockResolvedValue(SUFFICIENT_SNAPSHOT);
    vi.mocked(allowanceGateway.getStatementStoreSlots).mockResolvedValue([PUBLIC_KEY]);
  });

  it('is true when every requested kind is sufficient', async () => {
    await expect(allowanceUseCase.checkResourcesSufficiency({ ...PARAMS, kinds: ['bulletin', 'statementStore'] })).resolves.toBe(
      true,
    );
  });
  it('is false when the slot key is not cached', async () => {
    session.readAllowance.mockReturnValue(okAsync(null));
    await expect(allowanceUseCase.checkResourcesSufficiency({ ...PARAMS, kinds: ['bulletin'] })).resolves.toBe(false);
  });
  it('is false when the session allowance read fails', async () => {
    session.readAllowance.mockReturnValue(errAsync(new Error('storage broken')));
    await expect(allowanceUseCase.checkResourcesSufficiency({ ...PARAMS, kinds: ['bulletin'] })).resolves.toBe(false);
  });
  it('is false when one of several kinds is insufficient', async () => {
    vi.mocked(allowanceGateway.getStatementStoreSlots).mockResolvedValue([]);
    await expect(allowanceUseCase.checkResourcesSufficiency({ ...PARAMS, kinds: ['bulletin', 'statementStore'] })).resolves.toBe(
      false,
    );
  });
  it('is false when the statement-store read rejects', async () => {
    vi.mocked(allowanceGateway.getStatementStoreSlots).mockRejectedValue(new Error('shape mismatch'));
    await expect(allowanceUseCase.checkResourcesSufficiency({ ...PARAMS, kinds: ['statementStore'] })).resolves.toBe(false);
  });
  it('is false when a chain read throws', async () => {
    vi.mocked(allowanceGateway.getBulletinAuthorization).mockRejectedValue(new Error('ws down'));
    await expect(allowanceUseCase.checkResourcesSufficiency({ ...PARAMS, kinds: ['bulletin'] })).resolves.toBe(false);
  });
  it('is false for an empty kinds list (nothing to grant is not a grant)', async () => {
    await expect(allowanceUseCase.checkResourcesSufficiency({ ...PARAMS, kinds: [] })).resolves.toBe(false);
  });
});
