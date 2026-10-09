import { x25519 } from '@noble/curves/ed25519.js';
import { deriveSr25519PublicKey, signWithSr25519Secret, verifySr25519Signature } from '@novasamatech/statement-store';
import { describe, expect, it } from 'vitest';

import { deviceIdentityService } from './service';

const {
  deriveEncryptionPublicKey,
  deriveStatementAccountPublicKey,
  generateEncryptionPrivateKey,
  generateStatementAccountSeed,
  isValidEncryptionPublicKey,
  fromPairingIdentity,
} = deviceIdentityService;

describe('generateStatementAccountSeed', () => {
  it('returns a 64-byte expanded sr25519 secret', () => {
    const seed = generateStatementAccountSeed();

    expect(seed).toBeInstanceOf(Uint8Array);
    expect(seed.length).toBe(64);
  });

  it('returns a different seed on each call', () => {
    const a = generateStatementAccountSeed();
    const b = generateStatementAccountSeed();

    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('produces a seed that derives a 32-byte sr25519 public key', () => {
    const seed = generateStatementAccountSeed();
    const publicKey = deriveSr25519PublicKey(seed);

    expect(publicKey.length).toBe(32);
  });
});

describe('deriveStatementAccountPublicKey', () => {
  it('is deterministic for a given seed', () => {
    const seed = generateStatementAccountSeed();
    const a = deriveStatementAccountPublicKey(seed);
    const b = deriveStatementAccountPublicKey(seed);

    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});

describe('generateEncryptionPrivateKey', () => {
  it('returns a 32-byte X25519 private key', () => {
    const priv = generateEncryptionPrivateKey();

    expect(priv).toBeInstanceOf(Uint8Array);
    expect(priv.length).toBe(32);
  });

  it('returns a different key on each call', () => {
    const a = generateEncryptionPrivateKey();
    const b = generateEncryptionPrivateKey();

    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });
});

describe('deriveEncryptionPublicKey', () => {
  it('returns a 32-byte X25519 public key', () => {
    const priv = generateEncryptionPrivateKey();
    const pub = deriveEncryptionPublicKey(priv);

    expect(pub.length).toBe(32);
  });

  it('is deterministic for a given private key', () => {
    const priv = generateEncryptionPrivateKey();
    const a = deriveEncryptionPublicKey(priv);
    const b = deriveEncryptionPublicKey(priv);

    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('matches the noble/curves X25519 encoding', () => {
    const priv = generateEncryptionPrivateKey();
    const ours = deriveEncryptionPublicKey(priv);
    const reference = x25519.getPublicKey(priv);

    expect(Buffer.from(ours).equals(Buffer.from(reference))).toBe(true);
  });

  it('agrees with the peer on a shared secret', () => {
    const alicePriv = generateEncryptionPrivateKey();
    const bobPriv = generateEncryptionPrivateKey();

    const aliceSees = x25519.getSharedSecret(alicePriv, deriveEncryptionPublicKey(bobPriv));
    const bobSees = x25519.getSharedSecret(bobPriv, deriveEncryptionPublicKey(alicePriv));

    expect(Buffer.from(aliceSees).equals(Buffer.from(bobSees))).toBe(true);
  });
});

describe('isValidEncryptionPublicKey', () => {
  it('accepts a derived 32-byte key', () => {
    const pub = deriveEncryptionPublicKey(generateEncryptionPrivateKey());

    expect(isValidEncryptionPublicKey(pub)).toBe(true);
  });

  it('rejects a 65-byte key', () => {
    expect(isValidEncryptionPublicKey(new Uint8Array(65).fill(0xab))).toBe(false);
  });

  it('rejects a 33-byte value', () => {
    expect(isValidEncryptionPublicKey(new Uint8Array(33).fill(7))).toBe(false);
  });

  it('rejects empty input', () => {
    expect(isValidEncryptionPublicKey(new Uint8Array(0))).toBe(false);
  });

  // Deliberate limitation: every 32-byte string is a valid X25519 key, so degenerate
  // ones are caught at agreement time (RFC 7748), not here.
  it('accepts any 32 bytes — validity is enforced at key agreement', () => {
    expect(isValidEncryptionPublicKey(new Uint8Array(32).fill(0xff))).toBe(true);
  });
});

// The core's `PairingDeviceIdentity` as it writes it: schnorrkel `SecretKey::to_bytes`,
// whose scalar is the Ed25519-expanded one divided by the cofactor 8.
function encodePairingIdentity(expandedSecret: Uint8Array, encryptionPrivateKey: Uint8Array): Uint8Array {
  const schnorrkelSecret = new Uint8Array(64);
  let remainder = 0;
  for (let i = 31; i >= 0; i--) {
    const value = (remainder << 8) | expandedSecret[i]!;
    schnorrkelSecret[i] = value >> 3;
    remainder = value & 7;
  }
  schnorrkelSecret.set(expandedSecret.subarray(32), 32);

  const encoded = new Uint8Array(160);
  encoded.set(schnorrkelSecret, 0);
  encoded.set(deriveSr25519PublicKey(expandedSecret), 64);
  encoded.set(encryptionPrivateKey, 96);
  encoded.set(x25519.getPublicKey(encryptionPrivateKey), 128);

  return encoded;
}

describe('fromPairingIdentity', () => {
  it('signs as the advertised statement account and keeps the advertised encryption key', () => {
    const expandedSecret = generateStatementAccountSeed();
    const encryptionPrivateKey = generateEncryptionPrivateKey();

    const identity = fromPairingIdentity(encodePairingIdentity(expandedSecret, encryptionPrivateKey));

    expect(Buffer.from(identity.statementAccountSeed).equals(Buffer.from(expandedSecret))).toBe(true);
    expect(Buffer.from(identity.encryptionPublicKey).equals(Buffer.from(x25519.getPublicKey(encryptionPrivateKey)))).toBe(true);
    const message = new TextEncoder().encode('statement');
    const signature = signWithSr25519Secret(identity.statementAccountSeed, message);
    expect(verifySr25519Signature(message, signature, identity.statementAccountPublicKey)).toBe(true);
  });

  it('rejects a slot of the wrong length', () => {
    expect(() => fromPairingIdentity(new Uint8Array(159))).toThrow('expected 160');
  });

  it('rejects a statement public key that does not match the secret', () => {
    const encoded = encodePairingIdentity(generateStatementAccountSeed(), generateEncryptionPrivateKey());
    encoded[64] = encoded[64]! ^ 0xff;

    expect(() => fromPairingIdentity(encoded)).toThrow('statement secret does not match');
  });

  it('rejects an encryption public key that does not match the secret', () => {
    const encoded = encodePairingIdentity(generateStatementAccountSeed(), generateEncryptionPrivateKey());
    encoded[128] = encoded[128]! ^ 0xff;

    expect(() => fromPairingIdentity(encoded)).toThrow('encryption secret does not match');
  });
});
