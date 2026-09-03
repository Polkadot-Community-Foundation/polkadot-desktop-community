import { type HostMetadata, type PappAdapter, type StoredUserSession, createPappAdapter } from '@novasamatech/host-papp';
import { ensureSubstrateSlotSr25519Ready } from '@novasamatech/statement-store';
import { createLocalStorageAdapter } from '@novasamatech/storage-adapter';

import { getOperatingSystem, isElectron } from '@/shared/env';
import { contactRepository } from '@/domains/contact';
import { type UserIdentity } from '@/domains/device';
import { deviceSyncRepository } from '@/domains/device-sync';
import { userIdentity$ } from '@/domains/sso';
import { lazyClient, statementStoreAdapter } from '../statement-store/service';

import { HOST_PAPP_APP_ID } from './constants';

const version = process.env['VERSION'];

const pappStorage = createLocalStorageAdapter(HOST_PAPP_APP_ID);

// The device identity is owned and persisted by the SDK (host-papp's own
// `deviceIdentityStore`, obfuscated at rest). No app-side override — the app
// reads device + user identity back from the SDK via `./identity`.

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

const isAllZero = (bytes: Uint8Array): boolean => bytes.every(byte => byte === 0);

// A replayed Success carries the same identity — guard so we don't re-clear the
// per-user repos (wiping data the live orchestrator just synced) on every
// adapter re-mount.
const isSameIdentity = (current: UserIdentity | null, next: UserIdentity): boolean =>
  current !== null &&
  bytesEqual(current.peerDeviceStatementAccountId, next.peerDeviceStatementAccountId) &&
  bytesEqual(current.identityChatPublicKey, next.identityChatPublicKey) &&
  bytesEqual(current.identitySr25519PublicKey, next.identitySr25519PublicKey) &&
  bytesEqual(current.peerDeviceEncPubKey, next.peerDeviceEncPubKey);

// Fired by host-papp after it has already persisted the session + secrets (the
// SDK owns at-rest storage). We only fan the user-identity bits out to
// `userIdentity$` so the V2 chat/sync/SSO stack reacts, and clear the previous
// user's per-user repos when the identity actually changes.
const onPairingSuccess = async ({
  session,
  identityChatPrivateKey,
  ssoEncPubKey,
}: {
  session: StoredUserSession;
  identityChatPrivateKey: Uint8Array;
  ssoEncPubKey: Uint8Array | null;
}): Promise<void> => {
  const root = session.rootAccountId;
  const next: UserIdentity = {
    identityChatPublicKey: session.identityChatPublicKey ?? new Uint8Array(32),
    identityChatPrivateKey,
    identitySr25519PublicKey: session.identityAccountId ?? new Uint8Array(32),
    // Normalise the SDK's all-zero placeholder (peer omitted rootAccountId) to
    // null so product soft-derivation degrades instead of deriving from zeros.
    rootSr25519PublicKey: root && !isAllZero(root) ? root : null,
    // Peer device X25519 encryption key from the SDK's `deviceEncPubKey`, not
    // `remoteAccount.publicKey` (the 32-byte SSO shared secret).
    peerDeviceEncPubKey: session.deviceEncPubKey,
    peerDeviceStatementAccountId: session.remoteAccount.accountId,
    // `papp_encr_pub` per Mobile SSO v0.2.2; null for pre-v0.2.2 peers (every
    // build today), in which case the V2 SSO transport stays inactive and
    // operations like signPayload fall back to the `notSupported` stub path.
    ssoEncPubKey,
  };

  // The SDK replays a cached Success to fresh subscribers (every adapter
  // re-mount re-runs `authenticate()`). Without this guard each replay would
  // re-clear the device-sync + contact repos and respawn the orchestrator,
  // killing the in-flight WebRTC handshake before the data channel opens.
  if (isSameIdentity(userIdentity$.get(), next)) return;

  // Re-pair == potentially a different user (logout + new QR): drop the
  // previous user's device-sync peers and contacts before publishing. The
  // fresh device-sync session re-seeds PApp from `peerDeviceStatementAccountId`
  // and re-hydrates contacts from PApp's first `ChatsAdded` sync.
  await Promise.all([deviceSyncRepository.clearAll(), contactRepository.clearAll()]);
  userIdentity$.set(next);
};

const createPappAdapterWithHostMetadata = (hostMetadata?: HostMetadata): PappAdapter => {
  void ensureSubstrateSlotSr25519Ready();

  return createPappAdapter({
    appId: HOST_PAPP_APP_ID,
    hostMetadata,
    onAuthSuccess: onPairingSuccess,
    adapters: {
      lazyClient,
      statementStore: statementStoreAdapter,
      storage: pappStorage,
    },
  });
};

// Public URL to the Polkadot Desktop app icon (served from the community mirror
// on `main`), sent as the `HostIcon` metadata entry in the SSO handshake proposal
// so a paired mobile client can render it. Mirrors the Electron path's value in
// `main/index.ts` — the two build targets can't share a module.
const HOST_ICON_URL =
  'https://raw.githubusercontent.com/paritytech/polkadot-desktop-community/main/src/shared/assets/images/polkadot-desktop-icon.png';

const getHostMetadataForWeb = (): HostMetadata => ({
  hostName: 'Polkadot Desktop',
  hostVersion: version,
  hostIcon: HOST_ICON_URL,
  platformType: getOperatingSystem(),
});

// Module-level singleton: all consumers share one PappAdapter instance.
// Without this, each call to `usePappProvider()` previously ran its own
// `createPappAdapterWithHostMetadata` in an effect, which spawns its own
// `ssoSessionRepository` + `createSsoSessionManager` + `createUserSession`
// for every userSession known to storage. With 10+ ProductContainerBinding
// integrations all calling the hook, the host ended up with 20+ ghost
// sessions, each with its own statement-store subscriptions, each appending
// to its own `outgoingRequest` batch on the bulletin chain.
//
// Lives here (not in `hooks.ts`) so non-React consumers — bootstrap, route
// loaders, the device/user-identity readers in `identity.ts` — can obtain the
// adapter without importing a React hook module.
let singleton: PappAdapter | null = null;
let promise: Promise<PappAdapter> | null = null;
const listeners = new Set<(provider: PappAdapter) => void>();

export const getPappProvider = (): PappAdapter | null => singleton;

export const subscribePappProvider = (listener: (provider: PappAdapter) => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const ensurePappProvider = async (): Promise<PappAdapter> => {
  if (singleton) return singleton;
  if (promise) return promise;

  promise = (async () => {
    const hostMetadata: HostMetadata =
      isElectron() && window.App?.getHostMetadata ? await window.App.getHostMetadata() : getHostMetadataForWeb();
    const provider = createPappAdapterWithHostMetadata(hostMetadata);
    singleton = provider;
    for (const listener of listeners) listener(provider);
    return provider;
  })();

  return promise;
};
