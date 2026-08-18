import { AccountId } from '@polkadot-api/substrate-bindings';
import { describe, expect, it } from 'vitest';

import { allowanceGateway } from './gateway';

const PUBLIC_KEY = new Uint8Array(32).fill(1);
// SS58 (prefix 42) of PUBLIC_KEY — precompute in the test via the same codec the gateway uses:
const SS58 = AccountId().dec(PUBLIC_KEY);

function fakeApi(overrides: object) {
  return {
    query: {
      TransactionStorage: {
        Authorizations: {
          getValue: async () => ({
            extent: { transactions: 1, transactions_allowance: 5, bytes: 10n, bytes_allowance: 100n },
            expiration: 900,
          }),
        },
      },
      Resources: {
        StatementStoreAllowances: {
          getEntries: async () => [{ keyArgs: [123, '0xaa'], value: { account_id: SS58, seq: 0, since: 1n } }],
        },
      },
      ...overrides,
    },
  };
}

function fakeClient(overrides: object = {}) {
  return {
    getUnsafeApi: () => fakeApi(overrides),
    getFinalizedBlock: async () => ({ number: 500 }),
  };
}

describe('getBulletinAuthorization', () => {
  it('returns the parsed authorization and current finalized block', async () => {
    const snapshot = await allowanceGateway.getBulletinAuthorization(fakeClient(), PUBLIC_KEY);
    expect(snapshot.currentBlock).toBe(500);
    expect(snapshot.authorization?.extent.transactionsAllowance).toBe(5);
    expect(snapshot.authorization?.extent.bytesAllowance).toBe(100n);
  });

  it('returns a null authorization when the key is absent or the pallet is missing', async () => {
    const absent = await allowanceGateway.getBulletinAuthorization(
      fakeClient({ TransactionStorage: { Authorizations: { getValue: async () => undefined } } }),
      PUBLIC_KEY,
    );
    expect(absent.authorization).toBeNull();
    expect(absent.currentBlock).toBe(500);

    const noPallet = await allowanceGateway.getBulletinAuthorization(fakeClient({ TransactionStorage: undefined }), PUBLIC_KEY);
    expect(noPallet.authorization).toBeNull();
  });

  it('throws when the value shape mismatches (use case resolves it to insufficient)', async () => {
    const bad = fakeClient({ TransactionStorage: { Authorizations: { getValue: async () => ({ nope: 1 }) } } });
    await expect(allowanceGateway.getBulletinAuthorization(bad, PUBLIC_KEY)).rejects.toThrow();
  });
});

describe('getStatementStoreSlots', () => {
  it('returns the raw account bytes of the period slots', async () => {
    const slots = await allowanceGateway.getStatementStoreSlots(fakeApi({}), 123);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toEqual(PUBLIC_KEY);
  });

  it('returns an empty list when the pallet is missing', async () => {
    expect(await allowanceGateway.getStatementStoreSlots({ query: {} }, 123)).toEqual([]);
  });

  it('skips entries whose value shape mismatches', async () => {
    const api = fakeApi({
      Resources: { StatementStoreAllowances: { getEntries: async () => [{ keyArgs: [123, '0xaa'], value: { bogus: true } }] } },
    });
    expect(await allowanceGateway.getStatementStoreSlots(api, 123)).toEqual([]);
  });
});
