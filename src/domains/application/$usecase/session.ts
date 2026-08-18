import { createSideEffect } from '@/shared/di';
import { clearAllP2PChatStorage, clearAllProductChatStorage } from '@/domains/chat';
import { contactRepository } from '@/domains/contact';
import { deviceSyncRepository } from '@/domains/device-sync';
import { userIdentity$ } from '@/domains/sso';
import { ensurePappProvider } from '../papp-provider/provider';

/**
 * Rotate the device identity; host-papp regenerates a fresh keypair on the next
 * `authenticate()`. This cryptographically erases any cached on-chain
 * `HandshakeSuccess` — it was ECDH-encrypted to the key we're discarding.
 *
 * Called on its own by the onboarding "retry" path, so a fresh pairing QR uses a
 * new device keypair, and as the last step of `performUserLogout`.
 */
const resetDeviceIdentity = async (): Promise<void> => {
  const adapter = await ensurePappProvider();
  await adapter.sso.resetDeviceIdentity();
};

const reloadRenderer = () => {
  // Tanstack hash router preserves `#/<path>` across reloads. If the user
  // pressed Log Out from `/dashboard`, a bare reload returns them to
  // `/dashboard` (which has no auth guard); resetting the hash to root makes
  // the `/` route's `userIdentity$` check run and route them to /onboarding.
  if (typeof window !== 'undefined') {
    window.location.hash = '#/';
  }
  window.App?.reload() ?? window.location.reload();
};

/**
 * Tear down all V2 user-identity state and flip `userIdentity$` to `null`.
 *
 * Reached through `performUserLogout`, which the host-papp session-teardown
 * watcher (`watchHostPappSessionTeardown`) runs whenever the SDK session
 * disappears — the Log Out button, a network switch, or a peer-initiated
 * `Disconnected` all remove the session and converge here.
 *
 * Order matters: wipe the per-user repos BEFORE flipping `userIdentity$`. The
 * chat manager and device-sync orchestrator react to `userIdentity$` going null
 * and tear themselves down — if they observe the
 * transition while stale rows still exist on disk, their final reactive pass
 * may rearm against the old user's data and bleed into the next pairing.
 *
 * `onPairingSuccess` on the NEXT login also clears `contactRepository`
 * and `deviceSyncRepository`, but it doesn't run on logout, so we must do it
 * here to keep the previous user's roster + chat history from carrying over.
 *
 * Only *application*-owned state is torn down here. The SDK-owned user identity
 * — the session, its secrets, the allowance slot keys — is host-papp's to drop,
 * and it already has: this runs because the session left `adapter.sessions`,
 * which host-papp only does after purging everything that session persisted.
 * The device keypair survives, rotated separately by `performUserLogout`.
 */
/**
 * Fires during V2 logout, after the application-owned repos are cleared. Domains that persist
 * per-user data register a handler here instead of being called directly: `@/domains/product`
 * already imports `@/domains/application`, so a direct call in the other direction closes an
 * import cycle that `import-x/no-cycle` rejects.
 *
 * Named for the place of use (the logout), not for any provider.
 */
export const onUserLoggedOutSideEffect = createSideEffect<void>({ name: 'onUserLoggedOut' });

const runV2Logout = async (): Promise<void> => {
  try {
    // `allSettled`, not `all`: a wipe that rejects (a blocked IndexedDB connection, say)
    // must not strand the user in an authenticated shell. Leftover local data on an
    // otherwise-signed-out app is recoverable; a logout that never completes is not.
    const results = await Promise.allSettled([
      contactRepository.clearAll(),
      deviceSyncRepository.clearAll(),
      clearAllP2PChatStorage(),
      clearAllProductChatStorage(),
    ]);
    for (const result of results) {
      if (result.status === 'rejected') {
        console.warn('[sso] logout: per-user storage wipe failed', result.reason);
      }
    }
    // Awaited after the application-owned clears, not alongside them: a handler that
    // throws must not mask a failure in the teardown above. `apply` settles, it never rejects.
    await onUserLoggedOutSideEffect.apply();
  } finally {
    userIdentity$.set(null);
  }
};

/**
 * Full user-initiated logout — runs `runV2Logout` (which clears the SDK-owned
 * user identity, the per-user repos, and host-papp's session cache), rotates
 * the device identity so the cached on-chain `HandshakeSuccess` becomes
 * unreadable, then reloads.
 *
 * The pairing topic is `khash(statementAccountId, encryptionPublicKey ||
 * "topic")` and the Success payload on it is ChaCha20-Poly1305 encrypted via X25519
 * against our `encryptionPublicKey`. Dropping the device keypair means the next
 * `authenticate()` subscribes to a brand new topic (no cached statements),
 * and any old Success'es still within bulletin-chain retention are
 * encrypted to a private key we no longer hold — cryptographically erased.
 *
 * The reload at the end resets module-level state captured at startup
 * (`bootstrap`'s memoised `device`), so subsequent re-pairs start clean.
 */
const performUserLogout = async (): Promise<void> => {
  try {
    await runV2Logout();
  } catch (error) {
    // `runV2Logout` already clears the identity in its own `finally`, so reloading
    // here still lands on the login screen — reporting beats stalling on this screen.
    console.error('[sso] logout teardown failed; reloading to the login screen anyway', error);
  } finally {
    await resetDeviceIdentity();
    reloadRenderer();
  }
};

export const sessionUseCase = {
  runV2Logout,
  performUserLogout,
  resetDeviceIdentity,
};
