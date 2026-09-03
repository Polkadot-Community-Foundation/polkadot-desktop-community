/**
 * Handshake V2 state-machine behaviour — pure transitions over `HandshakeState`
 * (no I/O). The caller decrypts the outer envelope and length-dispatches to
 * `decodeEncryptedHandshakeResponseV2` (schemas.ts) before calling
 * `fromInnerResponse`.
 */

import { x25519 } from '@noble/curves/ed25519.js';

import { type DecodedHandshakeResponseV2 } from './schemas';
import {
  type HandshakeFailedState,
  type HandshakeIdleState,
  type HandshakeState,
  type HandshakeSubmittedState,
  type HandshakeSuccessState,
} from './types';

// X25519 public key — 32 bytes (CHAT-RFC-0004).
const deriveIdentityChatPublicKey = (privateKey: Uint8Array): Uint8Array => x25519.getPublicKey(privateKey);

const idle = (): HandshakeIdleState => ({ tag: 'Idle' });

const submitted = (): HandshakeSubmittedState => ({ tag: 'Submitted' });

// Translate the length-dispatched-decoded EncryptedHandshakeResponseV2 into the
// public state. Pure — no I/O.
const fromInnerResponse = (response: DecodedHandshakeResponseV2): HandshakeState => {
  switch (response.tag) {
    case 'Pending':
      // Only AllowanceAllocation today; widen here when the spec adds more variants.
      return { tag: 'Pending', reason: 'AllowanceAllocation' };
    case 'Success':
      return {
        tag: 'Success',
        identityAccountId: response.value.identityAccountId,
        rootAccountId: response.value.rootAccountId,
        identityChatPrivateKey: response.value.identityChatPrivateKey,
        identityChatPublicKey: deriveIdentityChatPublicKey(response.value.identityChatPrivateKey),
        deviceEncPubKey: response.value.deviceEncPubKey,
        // Local renderer-side decoder hasn't been updated for v0.2.2 yet —
        // host-papp's decoder is the canonical path that surfaces this on
        // `onAuthSuccess`. Onboarding UI only inspects the state tag here.
        ssoEncPubKey: null,
      };
    case 'Failed':
      return { tag: 'Failed', reason: response.value };
  }
};

// Forward-only transition guard: rejects regressions like Success → Pending.
const advance = (current: HandshakeState, next: HandshakeState): HandshakeState => {
  if (isTerminal(current)) return current;
  if (current.tag === 'Idle' && next.tag !== 'Submitted') return current;
  if (current.tag === 'Submitted' && next.tag === 'Idle') return current;
  return next;
};

const isTerminal = (state: HandshakeState): state is HandshakeSuccessState | HandshakeFailedState =>
  state.tag === 'Success' || state.tag === 'Failed';

// True only when the device is authorized to submit V2 statements. The
// chat-send path gates on this — V2 messages must wait for allowance.
const canSubmitV2Statements = (state: HandshakeState): state is HandshakeSuccessState => state.tag === 'Success';

export const handshakeService = {
  idle,
  submitted,
  fromInnerResponse,
  advance,
  isTerminal,
  canSubmitV2Statements,
};
