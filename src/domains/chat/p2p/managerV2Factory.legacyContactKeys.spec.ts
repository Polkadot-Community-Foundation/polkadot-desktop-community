/**
 * Regression guard for the P-256 → X25519 migration.
 *
 * The `contact` IndexedDB is at version 3 on both sides of that change with an identical
 * version ladder, so no Dexie upgrade callback runs and rows written by a P-256-era build
 * survive verbatim — carrying a 65-byte uncompressed SEC1 key (`0x04 || X || Y`) in
 * `identityChatPublicKey` and in `devices[].encryptionPublicKey`.
 *
 * `x25519.getSharedSecret` throws on anything but 32 bytes. Every read of those fields
 * happens inside `manager.initialize()`, and `p2pChatUseCase` swallows that rejection with
 * a bare `console.error`, so the failure is invisible: the chat list is empty forever, with
 * no error UI and nothing telling the user to reset.
 *
 * These tests assert the legacy row is rejected at the READ, before it can reach key
 * agreement. The `createIdentityChannel` mock below deliberately performs the same
 * `computeSharedSecret` call the real implementation does (identityChannel.ts), against the
 * REAL `p2pService`, so a regression in the guard reproduces the production failure here
 * rather than passing silently.
 */
import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { contactRepository } from '@/domains/contact';

import { p2pChatDatabase } from './repository';
import { p2pService } from './service';

const OWN_USER_ID = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';
const PEER_ID = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';

const key = (fill: number) => new Uint8Array(32).fill(fill);
const OWN_IDENTITY_CHAT_PRIVATE_KEY = key(0x66);

/** 65-byte uncompressed SEC1 P-256 public key, exactly as the pre-X25519 build persisted it. */
const LEGACY_P256_KEY_HEX = `0x04${'ab'.repeat(64)}`;
/** A genuine X25519 public key, for the control cases. */
const VALID_X25519_KEY_HEX = `0x${Buffer.from(p2pService.computeSharedSecret(key(0x77), p2pServicePublicKeyProbe())).toString('hex')}`;

/** Derives a real X25519 public key without importing @noble directly in the test. */
function p2pServicePublicKeyProbe(): Uint8Array {
  // 9 is the X25519 base point u-coordinate; ECDH against it is scalar multiplication of
  // the base point, i.e. exactly `getPublicKey`.
  const basePoint = new Uint8Array(32);
  basePoint[0] = 9;

  return basePoint;
}

const createIdentityChannelSpy = vi.fn<(peerIdentityChatPublicKey: Uint8Array) => void>();
const createSessionSpy = vi.fn();

vi.mock('./chatSessionV2', () => ({
  createChatPeerSessionV2: () => {
    createSessionSpy();

    return { send: vi.fn().mockResolvedValue({ messageId: 'm', timestamp: 1 }), dispose: vi.fn() };
  },
  isMessageTooLargeError: () => false,
}));

vi.mock('./identityChannel', async () => {
  const { p2pService: realService } = await import('./service');

  return {
    createIdentityChannel: (params: { ownIdentityChatPrivateKey: Uint8Array; peerIdentityChatPublicKey: Uint8Array }) => {
      // Mirrors identityChannel.ts — the line that throws on a legacy key in production.
      realService.computeSharedSecret(params.ownIdentityChatPrivateKey, params.peerIdentityChatPublicKey);
      createIdentityChannelSpy(params.peerIdentityChatPublicKey);

      return { post: vi.fn().mockResolvedValue(undefined), dispose: vi.fn() };
    },
  };
});

vi.mock('./requests/gateway', () => ({
  chatRequestGateway: {
    subscribeToIncomingRequestsV2: vi.fn().mockReturnValue(() => {}),
    sendChatRequestV2: vi.fn(),
  },
}));

vi.mock('./peer/gateway', () => ({
  peerGateway: {
    createPeerResolver: vi.fn().mockReturnValue({
      searchUsers: vi.fn().mockResolvedValue([]),
      getUsername: vi.fn().mockResolvedValue(undefined),
      getPeerContact: vi.fn().mockResolvedValue(null),
      getPeerChatKey: vi.fn().mockResolvedValue(new Uint8Array(32).fill(0xcc)),
    }),
  },
}));

vi.mock('./notifications/gateway', () => ({
  pushNotificationGateway: { sendPushNotification: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('./session-transport/gateway', () => ({
  transportGateway: { subscribeStatements: vi.fn().mockReturnValue(() => {}) },
}));

vi.mock('./subscription-registry', () => ({
  trackedSubscribeStatements: vi.fn().mockReturnValue(() => {}),
}));

vi.mock('@/domains/application', () => ({
  environmentUseCase: {
    getActive: vi.fn().mockResolvedValue({ bulletinHopEndpoints: [''] }),
    getActiveId: vi.fn().mockReturnValue('test-env'),
    getById: vi.fn().mockResolvedValue({ backendUrl: 'https://example.invalid' }),
  },
}));

vi.mock('@/domains/device-sync/repository', () => ({
  deviceSyncRepository: {
    list: vi.fn().mockResolvedValue([]),
    listActivePeers: vi.fn().mockResolvedValue([]),
    upsertFromRoster: vi.fn(),
  },
}));

vi.mock('@novasamatech/statement-store', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();

  return { ...actual, createEncryption: () => ({ encrypt: vi.fn(), decrypt: vi.fn() }) };
});

const { createP2PChatManagerV2 } = await import('./managerV2Factory');

const buildManager = () =>
  createP2PChatManagerV2({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions -- test double for the SDK adapter; only the mocked session touches it
    statementStore: {} as any,
    identity: { getIdentity: vi.fn() },
    userId: OWN_USER_ID,
    device: {
      statementAccountPublicKey: key(0x11),
      statementAccountSeed: new Uint8Array(64).fill(0x22),
      encryptionPrivateKey: key(0x33),
      encryptionPublicKey: key(0x44),
    },
    userIdentity: {
      identitySr25519PublicKey: key(0x55),
      identityChatPrivateKey: OWN_IDENTITY_CHAT_PRIVATE_KEY,
      identityChatPublicKey: key(0x67),
      rootSr25519PublicKey: null,
      peerDeviceEncPubKey: key(0x68),
      peerDeviceStatementAccountId: key(0x69),
      ssoEncPubKey: null,
    },
  });

const seedRoomWithContactKey = async (identityChatPublicKey: string, deviceEncryptionPublicKey: string) => {
  await p2pChatDatabase.rooms.put({
    sessionId: PEER_ID,
    peerId: PEER_ID,
    peerUsername: 'legacy-peer',
    userId: OWN_USER_ID,
    createdAt: 1,
    isBlocked: false,
    lastUpdate: 1,
  });
  await contactRepository.upsert({
    accountId: PEER_ID,
    identityChatPublicKey,
    devices: [{ statementAccountId: `0x${'99'.repeat(32)}`, encryptionPublicKey: deviceEncryptionPublicKey }],
  });
};

describe('the hazard this guard exists for', () => {
  it('x25519 key agreement throws on a 65-byte P-256 public key', () => {
    expect(() =>
      p2pService.computeSharedSecret(
        OWN_IDENTITY_CHAT_PRIVATE_KEY,
        Uint8Array.from(Buffer.from(LEGACY_P256_KEY_HEX.slice(2), 'hex')),
      ),
    ).toThrow();
  });

  it('and accepts the 32-byte X25519 key the control cases use', () => {
    expect(() =>
      p2pService.computeSharedSecret(
        OWN_IDENTITY_CHAT_PRIVATE_KEY,
        Uint8Array.from(Buffer.from(VALID_X25519_KEY_HEX.slice(2), 'hex')),
      ),
    ).not.toThrow();
  });
});

describe('managerV2Factory: legacy P-256 contact rows', () => {
  beforeEach(async () => {
    await p2pChatDatabase.rooms.clear();
    await p2pChatDatabase.messages.clear();
    await p2pChatDatabase.requests.clear();
    await contactRepository.clearAll();
    createIdentityChannelSpy.mockClear();
    createSessionSpy.mockClear();
  });

  it('initialize() completes instead of dying on a saved room whose contact holds a 65-byte key', async () => {
    await seedRoomWithContactKey(LEGACY_P256_KEY_HEX, LEGACY_P256_KEY_HEX);
    const manager = await buildManager();

    // Without the guard this rejects inside `startIdentityChannelListener`, and
    // `p2pChatUseCase` swallows it — leaving the chat list permanently empty.
    await expect(manager.initialize()).resolves.toBeUndefined();

    // The legacy key never reached key agreement.
    expect(createIdentityChannelSpy).not.toHaveBeenCalled();
  });

  it('still opens the identity channel when the contact holds a real X25519 key', async () => {
    await seedRoomWithContactKey(VALID_X25519_KEY_HEX, VALID_X25519_KEY_HEX);
    const manager = await buildManager();

    await expect(manager.initialize()).resolves.toBeUndefined();

    expect(createIdentityChannelSpy).toHaveBeenCalledTimes(1);
    expect(createIdentityChannelSpy.mock.calls[0]?.[0]).toHaveLength(32);
  });

  it('initialize() completes on a pending outgoing request whose contact holds a 65-byte key', async () => {
    await p2pChatDatabase.requests.put({
      requestId: 'req-legacy',
      userId: OWN_USER_ID,
      peerId: PEER_ID,
      peerUsername: 'legacy-peer',
      direction: 'outgoing',
      status: 'pending',
      timestamp: 1,
      lastUpdate: 1,
    });
    await contactRepository.upsert({
      accountId: PEER_ID,
      identityChatPublicKey: LEGACY_P256_KEY_HEX,
      devices: [],
    });
    const manager = await buildManager();

    await expect(manager.initialize()).resolves.toBeUndefined();
  });

  it('drops a legacy device row from the roster rather than starting a session against it', async () => {
    // Identity key is fine, so the identity channel opens; only the DEVICE key is legacy.
    await seedRoomWithContactKey(VALID_X25519_KEY_HEX, LEGACY_P256_KEY_HEX);
    const manager = await buildManager();

    await expect(manager.initialize()).resolves.toBeUndefined();

    expect(createIdentityChannelSpy).toHaveBeenCalledTimes(1);
    // The only device was unusable, so the roster is empty and no transport is built.
    expect(createSessionSpy).not.toHaveBeenCalled();
  });

  it('startSession surfaces a legacy identity key as a descriptive error instead of a crypto throw', async () => {
    await seedRoomWithContactKey(LEGACY_P256_KEY_HEX, VALID_X25519_KEY_HEX);
    const manager = await buildManager();
    await manager.initialize();

    await expect(manager.startSession(PEER_ID, 'legacy-peer')).rejects.toThrow(/not a valid X25519 key/);
  });
});
