import { beforeEach, describe, expect, it, vi } from 'vitest';

const signalLocalChange = vi.fn();
vi.mock('@/domains/device-sync', () => ({ signalLocalChange: () => signalLocalChange() }));

const upsert = vi.fn().mockResolvedValue(undefined);
const del = vi.fn().mockResolvedValue(undefined);
const applyRemoteDelete = vi.fn().mockResolvedValue(undefined);
vi.mock('../identity/repository', () => ({
  contactRepository: {
    upsert: (...a: unknown[]) => upsert(...a),
    delete: (...a: unknown[]) => del(...a),
    applyRemoteDelete: (...a: unknown[]) => applyRemoteDelete(...a),
  },
}));

import { contactWriteUseCase } from './write';

const contact = { accountId: '0xabc', identityChatPublicKey: '0x04', devices: [] };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('contactWriteUseCase', () => {
  it('upsertContact persists then signals a local change', async () => {
    await contactWriteUseCase.upsertContact(contact);

    expect(upsert).toHaveBeenCalledWith(contact);
    expect(signalLocalChange).toHaveBeenCalledOnce();
  });

  it('deleteContact persists then signals a local change', async () => {
    await contactWriteUseCase.deleteContact('0xabc');

    expect(del).toHaveBeenCalledWith('0xabc');
    expect(signalLocalChange).toHaveBeenCalledOnce();
  });

  it('applyRemoteContactDelete drops WITHOUT signalling (no echo back to peers)', async () => {
    await contactWriteUseCase.applyRemoteContactDelete('0xabc');

    expect(applyRemoteDelete).toHaveBeenCalledWith('0xabc');
    expect(signalLocalChange).not.toHaveBeenCalled();
  });
});
