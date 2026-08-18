import { createBdd } from 'playwright-bdd';

import { expect, test } from '../fixtures/base';
import { DEFAULT_TIMEOUT } from '../helpers/timeouts';
import { DashboardPage } from '../page-objects/DashboardPage';
import { OnboardingPage } from '../page-objects/OnboardingPage';

const { When, Then } = createBdd(test);

// localStorage keys owned by the boot-time migrations in
// `src/domains/application/papp-provider/service.ts`.
const SSO_SESSIONS_KEY = 'polkadot_Polkadot Desktop_SsoSessions';
const SSO_MIGRATION_FLAG = 'polkadot_Polkadot Desktop_handshakeV2Migrated';
const SETTINGS_VALUE_KEY = 'polkadot_pb:settings_value';
const SETTINGS_MIGRATION_FLAG = 'polkadot_Polkadot Desktop_resetToRemoteConfigChannelsMigrated';

// --- TC-2.4.3 ---------------------------------------------------------------

Then('the user button shows the no-connection state', async ({ electronApp }) => {
  const dashboard = new DashboardPage(electronApp.window);
  await expect(dashboard.userButton).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  await dashboard.expectConnectionState('no-connection');
});

// --- TC-2.5.1 ---------------------------------------------------------------

When('a legacy SSO sessions blob is seeded and the app is reloaded', async ({ electronApp }) => {
  // Seed a malformed legacy V1 SsoSessions blob and clear the migration flag so
  // `migrateLegacySsoSessions()` re-runs on the next boot. Without the migration,
  // host-papp would SCALE-decode this blob and throw
  // `RangeError: Offset is outside the bounds of the DataView`, crashing bootstrap.
  await electronApp.window.evaluate(
    ({ blobKey, flagKey }) => {
      localStorage.setItem(blobKey, '0xdeadbeef-not-a-valid-scale-blob');
      localStorage.removeItem(flagKey);
    },
    { blobKey: SSO_SESSIONS_KEY, flagKey: SSO_MIGRATION_FLAG },
  );

  await electronApp.window.reload({ waitUntil: 'domcontentloaded' });
});

Then('the legacy SSO sessions blob has been cleared', async ({ electronApp }) => {
  await expect(async () => {
    const state = await electronApp.window.evaluate(
      ({ blobKey, flagKey }) => ({
        blob: localStorage.getItem(blobKey),
        flag: localStorage.getItem(flagKey),
      }),
      { blobKey: SSO_SESSIONS_KEY, flagKey: SSO_MIGRATION_FLAG },
    );
    expect(state.blob).toBeNull();
    expect(state.flag).toBe('1');
  }).toPass({ timeout: DEFAULT_TIMEOUT });
});

// --- TC-2.5.2 ---------------------------------------------------------------

When('a legacy network settings blob is seeded and the app is reloaded', async ({ electronApp }) => {
  // Seed a pre-Paseo-Next-V2 (0.3.x) settings shape — `{ endpointMode }`, no
  // `environmentId` — and clear the reset flag. On boot,
  // `resetPersistedStateToDefaultEnvironment()` must wipe it so the app falls
  // back to the default channel instead of crashing on an unknown environmentId.
  await electronApp.window.evaluate(
    ({ settingsKey, flagKey }) => {
      localStorage.setItem(settingsKey, JSON.stringify({ endpointMode: 'light' }));
      localStorage.removeItem(flagKey);
    },
    { settingsKey: SETTINGS_VALUE_KEY, flagKey: SETTINGS_MIGRATION_FLAG },
  );

  await electronApp.window.reload({ waitUntil: 'domcontentloaded' });
});

Then('the persisted network settings have reset to the default environment', async ({ electronApp }) => {
  // The migration removes the legacy blob; `persistLocalStorage` then keeps the
  // default in memory without re-writing it (it skips the initial value), so the
  // legacy `endpointMode` shape is gone and the reset flag is set.
  await expect(async () => {
    const state = await electronApp.window.evaluate(
      ({ settingsKey, flagKey }) => ({
        settings: localStorage.getItem(settingsKey),
        flag: localStorage.getItem(flagKey),
      }),
      { settingsKey: SETTINGS_VALUE_KEY, flagKey: SETTINGS_MIGRATION_FLAG },
    );
    expect(state.flag).toBe('1');
    // Either fully cleared (default kept in memory only) or re-persisted with a
    // valid environmentId — never the legacy endpointMode shape.
    if (state.settings !== null) {
      expect(state.settings).not.toContain('endpointMode');
      expect(state.settings).toContain('environmentId');
    }
  }).toPass({ timeout: DEFAULT_TIMEOUT });
});

// --- Shared (2.5.1 / 2.5.2) -------------------------------------------------

Then('the onboarding screen loads without a migration crash', async ({ electronApp }) => {
  // A broken migration lets host-papp throw during bootstrap → App renders an
  // error screen and the onboarding QR box never mounts. Its presence proves the
  // migration ran and the adapter constructed cleanly.
  const onboarding = new OnboardingPage(electronApp.window);
  await expect(onboarding.qrContainer).toBeVisible({ timeout: DEFAULT_TIMEOUT });
});
