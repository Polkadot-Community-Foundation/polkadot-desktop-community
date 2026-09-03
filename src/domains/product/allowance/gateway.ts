import { AccountId } from '@polkadot-api/substrate-bindings';
import * as v from 'valibot';

import { bulletinAuthorizationValueSchema, statementStoreSlotValueSchema } from './schemas';
import { type BulletinAuthorizationSnapshot } from './types';

// Minimal structural view of the papi client/unsafe api — callers hand in the
// real ones, specs hand in fakes. Storage items are optional because not every
// runtime carries these pallets; an absent item reads as "no grant". Any other
// failure (shape mismatch, transport) throws — the consuming use case owns the
// single conservative "failure → insufficient" catch.
type StorageEntry = {
  getValue?: (...args: unknown[]) => Promise<unknown>;
  getEntries?: (...args: unknown[]) => Promise<{ keyArgs: unknown[]; value: unknown }[]>;
};
type UnsafeQueryApi = { query: Record<string, Record<string, StorageEntry> | undefined> };
type BulletinClient = {
  getUnsafeApi(): UnsafeQueryApi;
  getFinalizedBlock(): Promise<{ number: number }>;
};

const accountIdCodec = AccountId();

async function getBulletinAuthorization(client: BulletinClient, publicKey: Uint8Array): Promise<BulletinAuthorizationSnapshot> {
  const [rawValue, block] = await Promise.all([
    client.getUnsafeApi().query['TransactionStorage']?.['Authorizations']?.getValue?.({
      type: 'Account',
      value: accountIdCodec.dec(publicKey),
    }),
    client.getFinalizedBlock(),
  ]);
  if (rawValue === undefined) return { authorization: null, currentBlock: block.number };

  const parsed = v.parse(bulletinAuthorizationValueSchema, rawValue);

  return {
    authorization: {
      extent: {
        transactions: parsed.extent.transactions,
        transactionsAllowance: parsed.extent.transactions_allowance,
        bytes: parsed.extent.bytes,
        bytesAllowance: parsed.extent.bytes_allowance,
      },
      expiration: parsed.expiration,
    },
    currentBlock: block.number,
  };
}

// Returns the raw 32-byte public keys of the slots' target accounts for the period.
async function getStatementStoreSlots(api: UnsafeQueryApi, period: number): Promise<Uint8Array[]> {
  const entries = (await api.query['Resources']?.['StatementStoreAllowances']?.getEntries?.(period)) ?? [];

  const slots: Uint8Array[] = [];
  for (const entry of entries) {
    const parsed = v.safeParse(statementStoreSlotValueSchema, entry.value);
    if (parsed.success) slots.push(accountIdCodec.enc(parsed.output.account_id));
  }

  return slots;
}

export const allowanceGateway = { getBulletinAuthorization, getStatementStoreSlots };
