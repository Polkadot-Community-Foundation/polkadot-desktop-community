import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { attachFailureScreenshot, shutdownElectronApp } from '../helpers/artifacts';
import { clearAppData } from '../helpers/cleanup';
import { registerProductDialogHandlers } from '../helpers/dialogs';
import { networkTld } from '../helpers/dotns';
import { type ElectronAppContext, launchElectronApp } from '../helpers/electron';
import { type E2eEnvironmentId, envToBotNetwork } from '../helpers/environment';
import {
  type LocalStorageSnapshot,
  type WorkerAuthApp,
  captureLocalStorageBaseline,
  resetToAuthenticatedBaseline,
} from '../helpers/reset-state';
import { signInWithHeal, waitForDashboardOrStuck } from '../helpers/sign-in';
import { waitForIdle } from '../helpers/wait';
import { OnboardingPage } from '../page-objects/OnboardingPage';

import { setupPlatformParameter } from './allure-metadata';
import { test as baseTest } from './base';

export const AUTH_ENVIRONMENT_ID: E2eEnvironmentId = 'nightly';
const AUTH_BOT_NETWORK = envToBotNetwork(AUTH_ENVIRONMENT_ID);

/**
 * The dotNS suffix every signed-in project resolves against. Steps complete a
 * product label with this rather than spelling a suffix, so a scenario names
 * `host-playground` and the environment decides what that is.
 */
export const AUTH_TLD = networkTld(AUTH_ENVIRONMENT_ID);

export type AuthTestFixtures = {
  /**
   * Authenticated Electron context for the test. For ordinary tests this is the
   * shared, worker-scoped app (signed in once per worker) after a per-test
   * soft-reset back to a clean `/dashboard` baseline. For `@isolated` scenarios
   * it is a throwaway fresh Electron with its own sign-in (today's behavior),
   * for tests that mutate/end the session or need a cold start.
   */
  authenticatedApp: ElectronAppContext;
};

export type AuthWorkerFixtures = {
  /**
   * Worker-scoped temp `userDataDir` for the shared authenticated app. Persists
   * across all tests in the worker so the signed-in session survives reloads.
   */
  authenticatedWorkerDataDir: string;

  /**
   * Worker-scoped controller over the shared authenticated Electron app. Lazily
   * launches + signs in on first `ensure()`, so a worker running only
   * `@isolated` tests never pays the sign-in. `relaunchAndSignIn` is the
   * soft-reset's crash/logout fallback.
   */
  authenticatedWorkerApp: WorkerAuthApp & { ensure(): Promise<ElectronAppContext> };
};

async function runSignIn(app: ElectronAppContext, botUrl: string, botUsername: string): Promise<void> {
  const onboarding = new OnboardingPage(app.window);
  await onboarding.selectEnvironment(AUTH_ENVIRONMENT_ID);
  await onboarding.waitForQrCode();
  await onboarding.connectViaBot(botUrl, botUsername);
  await waitForDashboardOrStuck(app.window);
  await waitForIdle(app.window);
}

const BOT_TOKEN = process.env['BOT_TOKEN'];

/**
 * Sign in with retries + permanent-user heal. Covers (a) the nightly finality
 * race (retry with storage reset), and (b) a permanent identity wedged by a
 * chain redeploy or an exhausted daily slot budget — healed by deleting the
 * bot user and falling back to a fresh identity for this run (see
 * helpers/sign-in.ts).
 */
async function signInWithRetry(app: ElectronAppContext, botUrl: string, botUsername: string): Promise<void> {
  await signInWithHeal({
    label: 'auth',
    network: AUTH_BOT_NETWORK,
    botUrl,
    botToken: BOT_TOKEN,
    username: botUsername,
    attempt: name => runSignIn(app, botUrl, name),
    beforeRetry: () => clearAppData(app.window),
  });
}

/** Launch a fresh Electron, install the dialog approver, clear state, sign in. */
async function launchAndSignIn(opts: { userDataDir: string; botUrl: string; botUsername: string }): Promise<ElectronAppContext> {
  const app = await launchElectronApp({ userDataDir: opts.userDataDir, autotest: true, botToken: BOT_TOKEN });
  // Install the (flag-gated) dialog auto-approver once on this page. It rides
  // every navigation via addInitScript, so it survives soft-reset reloads; the
  // per-test reset only flips the enable flag.
  await registerProductDialogHandlers(app.window);
  await clearAppData(app.window);
  await signInWithRetry(app, opts.botUrl, opts.botUsername);
  return app;
}

export const authenticatedTest = baseTest.extend<AuthTestFixtures, AuthWorkerFixtures>({
  authenticatedWorkerDataDir: [
    // eslint-disable-next-line no-empty-pattern -- Playwright fixture signature requires destructuring
    async ({}, use, workerInfo) => {
      const dir = path.join(os.tmpdir(), 'polkadot-desktop-e2e', `worker-auth-${workerInfo.workerIndex}-${Date.now()}`);
      await fs.mkdir(dir, { recursive: true });
      await use(dir);
      await fs.rm(dir, { recursive: true, force: true }).catch(err => console.warn(`Failed to cleanup ${dir}:`, err));
    },
    { scope: 'worker' },
  ],

  authenticatedWorkerApp: [
    async ({ botUrl, botUsername, botUserSession, authenticatedWorkerDataDir }, use) => {
      let ctx: ElectronAppContext | null = null;
      // localStorage as it stands immediately after sign-in, before any test has
      // run. The per-test soft-reset restores exactly this, so it never has to
      // name a session key (see helpers/reset-state.ts).
      let storageBaseline: LocalStorageSnapshot = {};

      const launch = async (): Promise<ElectronAppContext> => {
        await botUserSession.ensure(AUTH_BOT_NETWORK);
        const app = await launchAndSignIn({ userDataDir: authenticatedWorkerDataDir, botUrl, botUsername });
        storageBaseline = await captureLocalStorageBaseline(app.window);

        return app;
      };

      const controller: WorkerAuthApp & { ensure(): Promise<ElectronAppContext> } = {
        ensure: async () => {
          if (!ctx) ctx = await launch();
          return ctx;
        },
        current: () => {
          if (!ctx) throw new Error('authenticatedWorkerApp not initialised — call ensure() first');
          return ctx;
        },
        baseline: () => storageBaseline,
        relaunchAndSignIn: async () => {
          if (ctx) await shutdownElectronApp(ctx).catch(() => {});
          ctx = await launch();
          return ctx;
        },
      };

      await use(controller);

      if (ctx) {
        console.info('🔚 Closing worker-scoped authenticated app');
        await shutdownElectronApp(ctx);
      }
    },
    { scope: 'worker' },
  ],

  authenticatedApp: async (
    { authenticatedWorkerApp, botUrl, botUsername, botUserSession, userDataDir, autotest },
    use,
    testInfo,
  ) => {
    await setupPlatformParameter();
    const autoApproveDialogs = !testInfo.tags.includes('@manual-permissions');

    // `@isolated`: tests that mutate/end the session (logout) or need a cold
    // start get a throwaway fresh Electron with their own sign-in, leaving the
    // shared worker app untouched.
    if (testInfo.tags.includes('@isolated')) {
      await botUserSession.ensure(AUTH_BOT_NETWORK);
      const app = await launchElectronApp({ userDataDir, autotest, botToken: BOT_TOKEN });
      try {
        if (autoApproveDialogs) await registerProductDialogHandlers(app.window);
        await clearAppData(app.window);
        await signInWithRetry(app, botUrl, botUsername);
        await use(app);
      } finally {
        await attachFailureScreenshot(app, testInfo);
        await shutdownElectronApp(app);
      }
      return;
    }

    // Ordinary test: reuse the shared worker app after a soft-reset to a clean
    // authenticated baseline. Shutdown happens at worker teardown, not here.
    await authenticatedWorkerApp.ensure();
    const app = await resetToAuthenticatedBaseline(authenticatedWorkerApp, { autoApproveDialogs });
    await use(app);
    await attachFailureScreenshot(app, testInfo);
  },
});

export { expect } from '@playwright/test';
