import { Binary } from 'polkadot-api';
import { encodeFunctionResult } from 'viem';

import { type Environment } from '@/domains/application';

import { dotNsGateway } from './gateway';

const reviveApiCall = vi.fn();

vi.mock('@/domains/network', () => ({
  chainRegistry: {
    requestApi: (_chain: unknown, callback: (client: unknown) => unknown) =>
      callback({ api: { apis: { ReviveApi: { call: reviveApiCall } } } }),
  },
}));

const REGISTRY = '0xf34054fd76BbF85f216cf9908226D5f0A72E50CA';
const PROTOCOL_REGISTRY = '0xD19e3D0C97CF501125a04A97405e3e6592fa846E';

const REGISTRY_ABI = [
  {
    inputs: [],
    name: 'protocolRegistry',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const TLD_ABI = [
  { inputs: [], name: 'tld', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
] as const;

function returning(hex: `0x${string}`) {
  return { result: { success: true, value: { data: Binary.fromHex(hex) } } };
}

function protocolRegistryResult() {
  return returning(encodeFunctionResult({ abi: REGISTRY_ABI, functionName: 'protocolRegistry', result: PROTOCOL_REGISTRY }));
}

function tldResult(tld: string) {
  return returning(encodeFunctionResult({ abi: TLD_ABI, functionName: 'tld', result: tld }));
}

// Only the two fields `readTld` touches; `chainRegistry` is mocked, so the chain
// is never dereferenced.
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test fixture, not production code
const environment = { dotnsChain: {}, dotnsRegistryContract: REGISTRY } as unknown as Environment;

describe('readTld', () => {
  beforeEach(() => {
    reviveApiCall.mockReset();
  });

  test('reads the TLD through the protocol registry', async () => {
    reviveApiCall.mockResolvedValueOnce(protocolRegistryResult()).mockResolvedValueOnce(tldResult('.paseo'));

    await expect(dotNsGateway.readTld(environment)).resolves.toBe('.paseo');
  });

  test('returns null when the registry call reverts', async () => {
    reviveApiCall.mockResolvedValueOnce({ result: { success: false, value: {} } });

    await expect(dotNsGateway.readTld(environment)).resolves.toBeNull();
  });

  test('returns null when the protocol registry answers with empty data', async () => {
    reviveApiCall.mockResolvedValueOnce(protocolRegistryResult()).mockResolvedValueOnce(returning('0x'));

    await expect(dotNsGateway.readTld(environment)).resolves.toBeNull();
  });

  test('rejects a TLD that is not a single leading-dot label', async () => {
    reviveApiCall.mockResolvedValueOnce(protocolRegistryResult()).mockResolvedValueOnce(tldResult('paseo'));

    await expect(dotNsGateway.readTld(environment)).resolves.toBeNull();
  });
});
