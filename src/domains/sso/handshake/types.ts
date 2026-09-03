/**
 * Handshake V2 state machine — the public-facing observable shape of an
 * in-flight SSO pairing exchange.
 *
 *   Idle       — no proposal emitted yet
 *   Submitted  — proposal QR shown, waiting for the first response statement
 *   Pending    — Mobile acknowledged; allocating Statement Store allowance on-chain
 *   Success    — final state; identity keys received, device authorized
 *   Failed     — final state; PApp rejected (declined / duplicate / no-slot / tx-failed)
 *
 * Transitions are unidirectional except for Failed → Idle (user retries). The
 * state object is what UIs render and what the chat layer gates on before
 * submitting any V2 statements. Behaviour lives in `service.ts`.
 */

export type HandshakeIdleState = { tag: 'Idle' };
export type HandshakeSubmittedState = { tag: 'Submitted' };
export type HandshakePendingState = { tag: 'Pending'; reason: 'AllowanceAllocation' };
export type HandshakeSuccessState = {
  tag: 'Success';
  identityAccountId: Uint8Array;
  // Nullable: Android `feature/location-for-handshake` ships the v0.2 success
  // body without rootAccountId. The chat layer doesn't need it; product-account
  // soft-derivation does, and gracefully degrades when absent.
  rootAccountId: Uint8Array | null;
  identityChatPrivateKey: Uint8Array;
  identityChatPublicKey: Uint8Array;
  deviceEncPubKey: Uint8Array;
  // `papp_encr_pub` from Mobile SSO spec v0.2.2. Nullable for pre-v0.2.2
  // peers; the SSO session transport stays inactive while null.
  ssoEncPubKey: Uint8Array | null;
};
export type HandshakeFailedState = { tag: 'Failed'; reason: string };

export type HandshakeState =
  HandshakeIdleState | HandshakeSubmittedState | HandshakePendingState | HandshakeSuccessState | HandshakeFailedState;
