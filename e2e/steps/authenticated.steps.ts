import { createBdd } from 'playwright-bdd';

import { authenticatedTest, expect } from '../fixtures/authenticated';
import { DEFAULT_TIMEOUT } from '../helpers/timeouts';
import { DashboardPage } from '../page-objects/DashboardPage';
import { UserPopover } from '../page-objects/UserPopover';

const { Given, Then } = createBdd(authenticatedTest);

Given('the user is authenticated', async ({ authenticatedApp }) => {
  // Session already established by worker-scoped fixture
  // Verify by checking user card is visible and has logout button (i.e. user is signed in)
  const dashboard = new DashboardPage(authenticatedApp.window);
  await dashboard.clickUserButton();

  const userPopover = new UserPopover(authenticatedApp.window);
  await expect(userPopover.logoutButton).toBeVisible({ timeout: DEFAULT_TIMEOUT });

  // Close the popover by pressing Escape
  await authenticatedApp.window.keyboard.press('Escape');
});

// The worker-scoped authenticated session is shared across tests, so the app
// may be on a product tab from a prior scenario. Use this step in a Background
// when a scenario requires starting from the dashboard.
Given('the user is on the dashboard', async ({ authenticatedApp }) => {
  const dashboard = new DashboardPage(authenticatedApp.window);
  await dashboard.navigateToDashboard();
});

Then('the authenticated user info is visible in the top bar', async ({ authenticatedApp }) => {
  const dashboard = new DashboardPage(authenticatedApp.window);
  await expect(dashboard.userButton).toBeVisible({ timeout: DEFAULT_TIMEOUT });
});

Then('the authenticated session data exists in localStorage', async ({ authenticatedApp }) => {
  const pappKeys = await authenticatedApp.window.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('polkadot_')));
  expect(pappKeys.length).toBeGreaterThan(0);
});

Then('the SSO session and identity keys are persisted in localStorage', async ({ authenticatedApp }) => {
  // host-papp persists the SSO root session + per-session identity secrets under
  // the `polkadot_Polkadot Desktop_` appId prefix once pairing succeeds (these are
  // exactly the blobs logout later clears). Their presence proves the SSO root &
  // identity keys were fetched from the PApp on sign-in. Match by substring so a
  // future SDK version bump (UserSecretsV2 → V3, SsoSessionsV3 → V4) doesn't break
  // the assertion.
  const keys = await authenticatedApp.window.evaluate(() => Object.keys(localStorage));

  const hasIdentitySecrets = keys.some(k => k.includes('Polkadot Desktop_UserSecrets'));
  const hasRootSession = keys.some(
    k => k.includes('Polkadot Desktop_SsoSessions') || k.includes('Polkadot Desktop_DeviceIdentity'),
  );

  expect(hasIdentitySecrets, `expected per-session UserSecrets (identity keys); keys=${keys.join(',')}`).toBe(true);
  expect(hasRootSession, `expected an SSO root session / device-identity blob; keys=${keys.join(',')}`).toBe(true);
});
