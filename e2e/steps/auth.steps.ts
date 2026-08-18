import { type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { expect, test } from '../fixtures/base';
import { BotUserSession, permanentBotUsername } from '../helpers/bot-user';
import { clearAppData } from '../helpers/cleanup';
import { type E2eEnvironmentId, envToBotNetwork } from '../helpers/environment';
import { signInWithHeal, waitForDashboardOrStuck } from '../helpers/sign-in';
import { DEFAULT_TIMEOUT, VERY_LONG_TIMEOUT } from '../helpers/timeouts';
import { DashboardPage } from '../page-objects/DashboardPage';
import { OnboardingPage } from '../page-objects/OnboardingPage';
import { UserPopover } from '../page-objects/UserPopover';

const { Given, When, Then } = createBdd(test);

// A valid http URL with no listener — checkBotHealth fails fast (connection
// refused), driving the panel's health indicator to its "unreachable" state.
const UNREACHABLE_BOT_URL = 'http://localhost:59999';

function parseEnvironmentId(value: string): E2eEnvironmentId {
  if (value === 'nightly' || value === 'unstable') {
    return value;
  }
  throw new Error(`Unknown environment id: "${value}". Expected nightly | unstable.`);
}

/**
 * Full sign-in as a PERMANENT user declared in the .feature file (base name;
 * the helper appends the OS suffix). ensure() is instant once the name has
 * been attested anywhere; the heal path covers chain redeploys and slot
 * exhaustion. Ends at /dashboard — retry/heal needs the outcome, so callers
 * assert redirection as a cheap re-check.
 */
async function signInAsPermanentUser(
  window: Page,
  opts: { botUrl: string; environmentId: E2eEnvironmentId; base: string },
): Promise<void> {
  const network = envToBotNetwork(opts.environmentId);
  const botToken = process.env['BOT_TOKEN'];
  const username = permanentBotUsername(opts.base);
  await new BotUserSession(username, opts.botUrl, botToken).ensure(network);

  const onboarding = new OnboardingPage(window);
  await signInWithHeal({
    label: `auth:${opts.base}`,
    network,
    botUrl: opts.botUrl,
    botToken,
    username,
    attempt: async name => {
      // Re-selecting an already-selected environment is an idempotent click;
      // after a beforeRetry clearAppData() reload it is required to get back
      // to the QR screen.
      await onboarding.selectEnvironment(opts.environmentId);
      await onboarding.waitForQrCode();
      await onboarding.connectViaBot(opts.botUrl, name);
      await waitForDashboardOrStuck(window);
    },
    beforeRetry: () => clearAppData(window),
  });
}

When(
  'the user pairs via signing bot on {string} as {string}',
  async ({ electronApp, botUrl }, environment: string, base: string) => {
    await signInAsPermanentUser(electronApp.window, {
      botUrl,
      environmentId: parseEnvironmentId(environment),
      base,
    });
  },
);

Given(
  'the user is signed in on {string} via signing bot as {string}',
  async ({ electronApp, botUrl }, environment: string, base: string) => {
    await signInAsPermanentUser(electronApp.window, {
      botUrl,
      environmentId: parseEnvironmentId(environment),
      base,
    });
  },
);

Given('the user selects the {string} environment', async ({ electronApp }, environment: string) => {
  const onboarding = new OnboardingPage(electronApp.window);
  await onboarding.selectEnvironment(parseEnvironmentId(environment));
});

Then('the selected environment is {string}', async ({ electronApp }, environment: string) => {
  const onboarding = new OnboardingPage(electronApp.window);
  await onboarding.expectSelectedEnvironment(parseEnvironmentId(environment));
});

// Env-agnostic switch: picks whatever other channel the build offers (CI ships only
// `nightly`, local `.env.local` adds `unstable`), and skips when there is nothing to
// switch to — so the scenario never hard-codes a channel that a given build lacks.
When('the user switches to a different environment', async ({ electronApp }) => {
  const onboarding = new OnboardingPage(electronApp.window);
  const ids = await onboarding.availableEnvironmentIds();
  test.skip(ids.length < 2, `only ${ids.length} environment(s) configured — nothing to switch to`);
  await onboarding.switchToDifferentEnvironment();
});

Then('the selected environment changed from {string}', async ({ electronApp }, environment: string) => {
  const onboarding = new OnboardingPage(electronApp.window);
  await onboarding.expectSelectedEnvironmentChangedFrom(parseEnvironmentId(environment));
});

When(
  'the user pairs via signing bot on {string}',
  async ({ electronApp, botUrl, botUsername, botUserSession }, environment: string) => {
    const envId = parseEnvironmentId(environment);
    await botUserSession.ensure(envToBotNetwork(envId));
    const onboarding = new OnboardingPage(electronApp.window);
    await onboarding.connectViaBot(botUrl, botUsername);
  },
);

Given(
  'the user is signed in on {string} via signing bot',
  async ({ electronApp, botUrl, botUsername, botUserSession }, environment: string) => {
    const envId = parseEnvironmentId(environment);
    await botUserSession.ensure(envToBotNetwork(envId));
    const onboarding = new OnboardingPage(electronApp.window);
    await onboarding.selectEnvironment(envId);
    await onboarding.waitForQrCode();
    await onboarding.connectViaBot(botUrl, botUsername);

    await electronApp.window.waitForURL(/dashboard/, { timeout: VERY_LONG_TIMEOUT });
  },
);

Given('the signing bot panel is visible', async ({ electronApp }) => {
  const onboarding = new OnboardingPage(electronApp.window);
  await expect(onboarding.signingBotPanel).toBeVisible({ timeout: DEFAULT_TIMEOUT });
});

When('the user enters the reachable signing bot URL', async ({ electronApp, botUrl }) => {
  const onboarding = new OnboardingPage(electronApp.window);
  await onboarding.fillBotUrl(botUrl);
});

When('the user enters an unreachable signing bot URL', async ({ electronApp }) => {
  const onboarding = new OnboardingPage(electronApp.window);
  await onboarding.fillBotUrl(UNREACHABLE_BOT_URL);
});

Then('the signing bot health indicator shows reachable', async ({ electronApp }) => {
  const onboarding = new OnboardingPage(electronApp.window);
  await onboarding.expectBotReachable();
});

Then('the signing bot health indicator shows unreachable', async ({ electronApp }) => {
  const onboarding = new OnboardingPage(electronApp.window);
  await onboarding.expectBotUnreachable();
});

Then('the signing bot connect button is disabled', async ({ electronApp }) => {
  const onboarding = new OnboardingPage(electronApp.window);
  await expect(onboarding.signingBotPanel).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  await onboarding.expectConnectDisabled();
});

Then('the signing bot connect button is enabled', async ({ electronApp }) => {
  const onboarding = new OnboardingPage(electronApp.window);
  await onboarding.expectConnectEnabled();
});

Then('the user is redirected to dashboard', async ({ electronApp }) => {
  await electronApp.window.waitForURL(/dashboard/, { timeout: VERY_LONG_TIMEOUT });
});

Then('session data exists in localStorage', async ({ electronApp }) => {
  const pappKeys = await electronApp.window.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('polkadot_')));
  expect(pappKeys.length).toBeGreaterThan(0);
});

Then('user info is visible in the top bar', async ({ electronApp }) => {
  const dashboard = new DashboardPage(electronApp.window);
  await expect(dashboard.userButton).toBeVisible({ timeout: DEFAULT_TIMEOUT });
});

When('the user clicks logout', async ({ electronApp }) => {
  const dashboard = new DashboardPage(electronApp.window);
  const popover = new UserPopover(electronApp.window);

  await dashboard.clickUserButton();
  await popover.logout();
});

Then('session data is removed from localStorage', async ({ electronApp }) => {
  // Logout disconnects asynchronously and redirects to onboarding; the navigation can
  // destroy the evaluate execution context mid-call. Retry until the page settles and
  // localStorage is cleared.
  await expect(async () => {
    const pappKeys = await electronApp.window.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('polkadot_')));
    expect(pappKeys.length).toBe(0);
  }).toPass({ timeout: DEFAULT_TIMEOUT });
});

Then('user secrets are removed from localStorage', async ({ electronApp }) => {
  // See note above: logout triggers a redirect, so retry across the navigation.
  await expect(async () => {
    const secretKeys = await electronApp.window.evaluate(() => Object.keys(localStorage).filter(k => k.includes('userSecret')));
    expect(secretKeys.length).toBe(0);
  }).toPass({ timeout: DEFAULT_TIMEOUT });
});

Then('the user is redirected to onboarding screen', async ({ electronApp }) => {
  await electronApp.window.waitForURL(/onboarding/, { timeout: DEFAULT_TIMEOUT });
});
