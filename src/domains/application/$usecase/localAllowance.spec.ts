import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../statement-store/gateway', () => ({
  localAllowanceGateway: { getStatementStoreSlots: vi.fn() },
}));
vi.mock('../statement-store/service', () => ({
  lazyClient: { getClient: () => ({ getUnsafeApi: () => ({ query: {} }) }) },
}));
vi.mock('../papp-provider/identity', () => ({
  loadDeviceIdentity: vi.fn(),
}));

import { loadDeviceIdentity } from '../papp-provider/identity';
import { localAllowanceGateway } from '../statement-store/gateway';

import { localAllowanceUseCase } from './localAllowance';

const DEVICE_KEY = new Uint8Array(32).fill(3);
const OTHER_KEY = new Uint8Array(32).fill(9);

// Only `statementAccountPublicKey` is read; the rest satisfy `DeviceIdentity`.
const DEVICE_IDENTITY = {
  statementAccountPublicKey: DEVICE_KEY,
  statementAccountSeed: new Uint8Array(64),
  encryptionPrivateKey: new Uint8Array(32),
  encryptionPublicKey: new Uint8Array(65),
};

const getStatementStoreSlots = vi.mocked(localAllowanceGateway.getStatementStoreSlots);
const loadIdentity = vi.mocked(loadDeviceIdentity);

describe('localAllowanceUseCase.readLocalAllowance', () => {
  beforeEach(() => {
    getStatementStoreSlots.mockReset();
    loadIdentity.mockReset();
    loadIdentity.mockResolvedValue(DEVICE_IDENTITY);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is true when this device holds a slot in the current period', async () => {
    getStatementStoreSlots.mockResolvedValue([OTHER_KEY, new Uint8Array(32).fill(3)]);

    await expect(localAllowanceUseCase.readLocalAllowance()).resolves.toBe(true);
  });

  it('is false when the period has slots but none is this device', async () => {
    getStatementStoreSlots.mockResolvedValue([OTHER_KEY]);

    await expect(localAllowanceUseCase.readLocalAllowance()).resolves.toBe(false);
  });

  it('is false when the period has no slots at all', async () => {
    getStatementStoreSlots.mockResolvedValue([]);

    await expect(localAllowanceUseCase.readLocalAllowance()).resolves.toBe(false);
  });

  it('is null — not false — when the storage item is absent', async () => {
    getStatementStoreSlots.mockResolvedValue(null);

    await expect(localAllowanceUseCase.readLocalAllowance()).resolves.toBeNull();
  });

  it('is null when the device identity is unavailable', async () => {
    loadIdentity.mockResolvedValue(null);

    await expect(localAllowanceUseCase.readLocalAllowance()).resolves.toBeNull();
    expect(getStatementStoreSlots).not.toHaveBeenCalled();
  });

  it('is null when the read throws', async () => {
    getStatementStoreSlots.mockRejectedValue(new Error('transport down'));

    await expect(localAllowanceUseCase.readLocalAllowance()).resolves.toBeNull();
  });

  it('queries the current daily period', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-27T12:00:00Z'));
    getStatementStoreSlots.mockResolvedValue([]);

    await localAllowanceUseCase.readLocalAllowance();

    // 2026-07-27T12:00:00Z = 1_785_153_600s → floor(/86_400) = 20_661
    expect(getStatementStoreSlots).toHaveBeenCalledWith(expect.anything(), 20_661);
  });
});
