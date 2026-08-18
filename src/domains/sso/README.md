# sso

The `sso` domain owns the **V2 mobile-SSO handshake protocol**: the SCALE wire codecs for the proposal/response exchange, the
pure state machine that models an in-flight pairing (`HandshakeState`), and the reactive holder for the resulting user identity
(`userIdentity$`).

It is a **protocol + identity-holder** layer, not an orchestration one. It defines _what_ a handshake message looks like and
_what states_ a pairing moves through; it does not drive the pairing (the host-papp SDK owns the pairing service, device-identity
persistence, and secrets/session storage) and it does not render onboarding UI (the `onboarding` feature owns the React hook that
consumes this domain).

## Vocabulary

- **Handshake (V2)** — the mobile-SSO pairing exchange: the Host (Polkadot Desktop) emits a `VersionedHandshakeProposal::V2` via
  QR; PApp replies over the Statement Store with a `VersionedHandshakeResponse` whose body is ECDH-encrypted; the inner payload
  is `EncryptedHandshakeResponseV2 = Pending | Success | Failed`. Codecs: `handshake/schemas.ts`.
- **`HandshakeState`** — the public state-machine shape a pairing moves through: `Idle → Submitted → Pending → Success | Failed`
  (Failed → Idle on retry). Behaviour in `handshakeService` (`handshake/service.ts`); types in `handshake/types.ts`.
- **User identity** — the V2 identity produced by a successful handshake (`UserIdentity` from the `device` domain: identity chat
  key + identity sr25519 key + the authorising peer device's keys). Held reactively in `userIdentity$`.
- **`userIdentity$`** — a synchronous, reactive cache of the SDK-owned identity: `null` until a V2 handshake completes on this
  device. Set by `application/papp-provider` (`hydrateUserIdentity` reads it back from the SDK on startup; `onPairingSuccess`
  publishes it on a fresh pairing); cleared on logout/teardown. Consumers observe it (`useRxState` / `.value$`) to gate routing,
  device-sync startup, and tab resets on an identity switch.

## Scope

This domain owns:

- **Handshake wire codecs** — `handshake/schemas.ts`: the proposal/response SCALE codecs and the length-dispatched
  `decodeEncryptedHandshakeResponseV2` (the trust boundary for a decrypted response body).
- **The handshake state machine** — `handshakeService`: `idle` / `submitted` / `fromInnerResponse` / `advance` (forward-only
  guard) / `isTerminal` / `canSubmitV2Statements` (the gate the chat-send path checks). Pure, no I/O.
- **The user-identity holder** — `userIdentity$`.

## Boundaries

This domain does **not** own:

- **Driving the pairing** — `authenticate()`, the QR lifecycle, and secrets/session persistence are the host-papp SDK's, bridged
  by `application/papp-provider`. The renderer-side decode path here is retained for legacy/tests; host-papp's decoder is the
  canonical live path.
- **The onboarding UI + its hook** — `useHandshakeV2` (which translates the SDK `PairingStatus` into `HandshakeState`) lives in the
  `onboarding` feature, the only consumer.
- **Populating `userIdentity$`** — `application/papp-provider` owns the SDK reads (`loadUserIdentity` / `hydrateUserIdentity`) that
  set it.

## Note — deferred cleanup

`userIdentity$` is a `createState` living in a domain, which the runtime-state rule flags for an aggregate. Its clean migration is
blocked by the `domains → aggregate` boundary (its writer, `papp-provider`, is a domain) and belongs to papp-provider's own
aggregate migration — so `handshake/userIdentityState.ts` is intentionally left in place for now.

## References

- [`scale-ts`](https://www.npmjs.com/package/scale-ts) — the SCALE codecs for the handshake wire format.
- [`@noble/curves`](https://github.com/paulmillr/noble-curves) — X25519 derivation of the identity chat public key
  (CHAT-RFC-0004).
- Mobile SSO spec v0.2.x (HackMD) — the authoritative proposal/response shapes and the `Success` body revisions (96B v0.2 /
  128B v0.2.1).
