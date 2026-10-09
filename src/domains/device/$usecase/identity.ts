import { encodeCoreStorageKey } from '@parity/truapi-host';

import { coreStorageUseCase } from '@/domains/product';
import { deviceIdentityRepository } from '../identity/repository';
import { deviceIdentityService } from '../identity/service';
import { type DeviceIdentity } from '../identity/types';

const PAIRING_IDENTITY_KEY = encodeCoreStorageKey({ tag: 'PairingDeviceIdentity' });

// One in-flight mint per process. Without it two callers arriving in the same tick
// both see an empty store and both generate; the repository would settle the race,
// but only after the loser had already derived from a key it then discards.
let loading: Promise<DeviceIdentity> | null = null;

function toIdentity(statementAccountSeed: Uint8Array, encryptionPrivateKey: Uint8Array): DeviceIdentity {
  return {
    statementAccountSeed,
    statementAccountPublicKey: deviceIdentityService.deriveStatementAccountPublicKey(statementAccountSeed),
    encryptionPrivateKey,
    encryptionPublicKey: deviceIdentityService.deriveEncryptionPublicKey(encryptionPrivateKey),
  };
}

async function load(): Promise<DeviceIdentity> {
  const existing = await deviceIdentityRepository.read();
  if (existing) return toIdentity(existing.statementAccountSeed, existing.encryptionPrivateKey);

  const stored = await deviceIdentityRepository.create({
    id: deviceIdentityRepository.ROW_ID,
    statementAccountSeed: deviceIdentityService.generateStatementAccountSeed(),
    encryptionPrivateKey: deviceIdentityService.generateEncryptionPrivateKey(),
    createdAt: Date.now(),
  });

  return toIdentity(stored.statementAccountSeed, stored.encryptionPrivateKey);
}

function getMintedIdentity(): Promise<DeviceIdentity> {
  loading ??= load().catch((error: unknown) => {
    loading = null;
    throw error;
  });

  return loading;
}

/**
 * This device's identity.
 *
 * Once the core has paired, this is the identity it advertised in the handshake: the
 * wallet allocated the statement allowance to that account and addresses device sync to
 * that encryption key, so peers only know this device by it. It lives until logout,
 * when the core discards it.
 *
 * The core creates that identity when a login starts; until then the install's own minted
 * keys stand in. Read on every call, not memoised, so an identity created after the first
 * read takes effect.
 */
async function getDeviceIdentity(): Promise<DeviceIdentity> {
  const paired = await coreStorageUseCase.readSlot(PAIRING_IDENTITY_KEY);
  if (paired) return deviceIdentityService.fromPairingIdentity(paired);

  return getMintedIdentity();
}

/**
 * Discard this device's identity so the next read mints a fresh one.
 *
 * Cryptographically retires the install as a peer: everything addressed to the old
 * statement account becomes unreachable, which is the point — it runs on logout and
 * on the onboarding retry, where carrying the previous identity forward would let a
 * new user inherit the previous one's peers.
 */
async function resetDeviceIdentity(): Promise<void> {
  loading = null;
  await deviceIdentityRepository.clear();
}

export const deviceIdentityUseCase = {
  getDeviceIdentity,
  resetDeviceIdentity,
};
