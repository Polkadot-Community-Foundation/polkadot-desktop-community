# papp-provider

The `application/papp-provider` container is the app's integration with the **host-papp SDK** — the
`@novasamatech/host-papp` `PappAdapter` that owns the V2 multi-device session, the device/user
identity secrets at rest, and the pairing (`authenticate`) lifecycle. It reconstructs the app's
`DeviceIdentity` / `UserIdentity` shapes from SDK-owned state and bridges the SDK's session events
into the app.

## Vocabulary

- **PApp adapter** — the single `PappAdapter` instance from `createPappAdapter`. One per app run,
  shared by every consumer (React and non-React). The word for the SDK object, not "provider" in
  the DI sense.
- **SDK-owned identity** — device + user key material persisted by host-papp (`adapter.secrets` /
  `adapter.sessions`), obfuscated at rest. The app never persists key material itself; it reads it
  back into `DeviceIdentity` / `UserIdentity` (see `@/domains/device`).
- **Pairing success** (`onPairingSuccess`) — the SDK's `onAuthSuccess` callback; fans the user
  identity out to `userIdentity$` (`@/domains/sso`) and clears the previous user's per-user repos.
- **Session teardown** — the SDK removing the `UserSession` (Log Out, network switch, or peer
  `Disconnected`), watched by `watchHostPappSessionTeardown`, which converges on the logout use case.

## Container-root primitives (deferred — README-framed)

Most of this container wraps a **stateful SDK connection object and one-shot host migrations**. Like
`network/api/registry` and `application/statement-store`'s adapter, these do not fit a canonical
domain artifact (`resource` / `gateway` / `repository` / `service`) without distortion, so they are
kept as named container-root primitives framed here (per the architecture-checklist § Domain module
structure exemption), rather than forced into a canonical file:

- **`provider.ts`** — the adapter primitive: the lazily-created, app-wide-shared `PappAdapter`
  singleton (`ensure` / `get` / `subscribe` PappProvider) with a `useSyncExternalStore`-compatible
  subscription, plus adapter construction (`createPappAdapterWithHostMetadata`,
  `getHostMetadataForWeb`), the `onPairingSuccess` handler. A module-level singleton
  is required so every consumer shares one adapter (multiple adapters spawn duplicate ghost sessions
  on the bulletin chain — see the file header).
- **`identity.ts`** — the SDK-owned identity readers (`loadDeviceIdentity`, `loadUserIdentity`,
  `hydrateUserIdentity`): read `adapter.sessions` + `adapter.secrets` and reconstruct the
  `DeviceIdentity` / `UserIdentity` shapes. Single-source SDK reads, co-located with the adapter.
- **`sessionTeardown.ts`** — `watchHostPappSessionTeardown`: subscribes the SDK session list and
  runs the logout use case when the session vanishes. A boot-time event bridge; it stays here rather
  than in a domain `bootstrap.ts` because the app-level startup ordering it plugs into is delicate.

## What lives elsewhere

- **Logout / session-teardown orchestration** — `application/$usecase/session.ts` (`sessionUseCase`:
  `performUserLogout`, `runV2Logout`, `resetDeviceIdentity`). It composes chat + contact +
  device-sync repos, `userIdentity$`, host localStorage, and the renderer reload — a cross-domain
  use case, not adapter infra.
- **`userIdentity$`** — owned by `@/domains/sso`. This container reads and writes it; it does not own
  it.

## References

- [`@novasamatech/host-papp`](https://www.npmjs.com/package/@novasamatech/host-papp) — `PappAdapter`,
  `authenticate`, `sessions` / `secrets` stores.
