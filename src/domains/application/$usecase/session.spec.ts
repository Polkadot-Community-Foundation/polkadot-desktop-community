import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sessionUseCase } from './session';

const clearAllP2PChatStorage = vi.fn(async () => undefined);
const clearAllProductChatStorage = vi.fn(async () => undefined);
const contactClearAll = vi.fn(async () => undefined);
const deviceSyncClearAll = vi.fn(async () => undefined);
const userIdentitySet = vi.fn();

vi.mock('@/domains/chat', () => ({
  clearAllP2PChatStorage: () => clearAllP2PChatStorage(),
  clearAllProductChatStorage: () => clearAllProductChatStorage(),
}));
vi.mock('@/domains/contact', () => ({ contactRepository: { clearAll: () => contactClearAll() } }));
vi.mock('@/domains/device-sync', () => ({ deviceSyncRepository: { clearAll: () => deviceSyncClearAll() } }));
vi.mock('@/domains/sso', () => ({ userIdentity$: { set: (...args: unknown[]) => userIdentitySet(...args) } }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sessionUseCase.runV2Logout', () => {
  it('wipes every application-owned per-user store', async () => {
    await sessionUseCase.runV2Logout();

    expect(contactClearAll).toHaveBeenCalledTimes(1);
    expect(deviceSyncClearAll).toHaveBeenCalledTimes(1);
    expect(clearAllP2PChatStorage).toHaveBeenCalledTimes(1);
    expect(clearAllProductChatStorage).toHaveBeenCalledTimes(1);
  });

  it('clears the identity even when a repository wipe fails', async () => {
    contactClearAll.mockRejectedValueOnce(new Error('IndexedDB blocked'));

    await sessionUseCase.runV2Logout();

    expect(userIdentitySet).toHaveBeenCalledWith(null);
  });

  it('flips the identity to null only after the per-user repositories are wiped', async () => {
    const order: string[] = [];
    contactClearAll.mockImplementationOnce(async () => {
      order.push('contacts');
    });
    userIdentitySet.mockImplementationOnce(() => {
      order.push('identity');
    });

    await sessionUseCase.runV2Logout();

    expect(order).toStrictEqual(['contacts', 'identity']);
  });
});
