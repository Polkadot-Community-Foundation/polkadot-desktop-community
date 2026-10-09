import { x25519 } from '@noble/curves/ed25519.js';
import { createSr25519Secret, deriveSr25519PublicKey } from '@novasamatech/statement-store';
import { toHex } from 'polkadot-api/utils';

import { type DeviceIdentity } from './types';

const STATEMENT_ENTROPY_BYTES = 32;
/** X25519 public key size (CHAT-RFC-0004). */
const ENCRYPTION_PUBLIC_KEY_BYTES = 32;
/**
 * The core's `PairingDeviceIdentity`: statement secret (64), statement public key (32),
 * encryption secret (32), encryption public key (32), as SCALE fixed arrays.
 */
const PAIRING_IDENTITY_BYTES = 160;

const generateStatementAccountSeed = (): Uint8Array => {
  const entropy = crypto.getRandomValues(new Uint8Array(STATEMENT_ENTROPY_BYTES));
  return createSr25519Secret(entropy);
};

const deriveStatementAccountPublicKey = (seed: Uint8Array): Uint8Array => deriveSr25519PublicKey(seed);

const generateEncryptionPrivateKey = (): Uint8Array => x25519.utils.randomSecretKey();

// 32-byte X25519 key — matches `Contact.devices[].encryptionPublicKey` and `p2pService.computeSharedSecret`.
const deriveEncryptionPublicKey = (privateKey: Uint8Array): Uint8Array => x25519.getPublicKey(privateKey);

/**
 * Gate every externally-sourced device key through this before persisting or deriving
 * from it — peer `deviceAdded` payloads are unvalidated wire data, and persisted rows
 * can hold whatever an older build wrote.
 *
 * Size is all it can check: every 32-byte string is a valid X25519 public key.
 * Degenerate keys are caught at agreement time (@noble aborts on an all-zero shared
 * secret, RFC 7748).
 */
const isValidEncryptionPublicKey = (bytes: Uint8Array): boolean => bytes.length === ENCRYPTION_PUBLIC_KEY_BYTES;

/**
 * The core stores schnorrkel's `SecretKey::to_bytes` (scalar || nonce); the statement
 * prover takes the Ed25519-expanded layout, whose scalar is the same value times the
 * cofactor 8.
 */
const toEd25519ExpandedSecret = (secret: Uint8Array): Uint8Array => {
  const expanded = new Uint8Array(64);
  let carry = 0;
  for (let i = 0; i < 32; i++) {
    const value = (secret[i]! << 3) | carry;
    expanded[i] = value & 0xff;
    carry = value >> 8;
  }
  expanded.set(secret.subarray(32, 64), 32);

  return expanded;
};

/**
 * This device's identity as advertised in the pairing handshake, decoded from the core's
 * `PairingDeviceIdentity` slot. The wallet allocates the statement allowance to that
 * account and addresses device sync to that encryption key, so chat and device sync must
 * act as it.
 *
 * Throws when the slot does not decode to a consistent keypair, rather than signing as an
 * account nobody allocated.
 */
const fromPairingIdentity = (encoded: Uint8Array): DeviceIdentity => {
  if (encoded.length !== PAIRING_IDENTITY_BYTES) {
    throw new Error(`pairing identity is ${encoded.length} bytes, expected ${PAIRING_IDENTITY_BYTES}`);
  }

  const statementAccountSeed = toEd25519ExpandedSecret(encoded.subarray(0, 64));
  const statementAccountPublicKey = encoded.slice(64, 96);
  const encryptionPrivateKey = encoded.slice(96, 128);
  const encryptionPublicKey = encoded.slice(128, 160);

  if (toHex(deriveSr25519PublicKey(statementAccountSeed)) !== toHex(statementAccountPublicKey)) {
    throw new Error('pairing identity statement secret does not match its public key');
  }
  if (toHex(x25519.getPublicKey(encryptionPrivateKey)) !== toHex(encryptionPublicKey)) {
    throw new Error('pairing identity encryption secret does not match its public key');
  }

  return { statementAccountSeed, statementAccountPublicKey, encryptionPrivateKey, encryptionPublicKey };
};

export const deviceIdentityService = {
  generateStatementAccountSeed,
  deriveStatementAccountPublicKey,
  generateEncryptionPrivateKey,
  deriveEncryptionPublicKey,
  isValidEncryptionPublicKey,
  fromPairingIdentity,
};
