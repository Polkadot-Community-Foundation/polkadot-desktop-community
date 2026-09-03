import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { test as bddTest } from 'playwright-bdd';

import { e2eConfig } from '../config';
import { attachFailureScreenshot, attachRecordedVideo, shutdownElectronApp } from '../helpers/artifacts';
import { BotUserSession, makeBotUsername, permanentBotUsername } from '../helpers/bot-user';
import { clearAppData } from '../helpers/cleanup';
import { registerProductDialogHandlers } from '../helpers/dialogs';
import { type ElectronAppContext, launchElectronApp } from '../helpers/electron';
import { readPoolUserForSlot } from '../setup/bot-user-pool';

import { setupPlatformParameter } from './allure-metadata';

export type TestFixtures = {
  /**
   * Electron app context with app instance and main window
   */
  electronApp: ElectronAppContext;

  /**
   * Temporary user data directory for this test
   */
  userDataDir: string;

  /**
   * Whether to launch with AUTOTEST mode (default: false)
   */
  autotest: boolean;
};

export type WorkerFixtures = {
  /**
   * Signing-bot username for this project, random per worker.
   * Set via `use: { botUsername: makeBotUsername() }` in playwright.config.ts.
   */
  botUsername: string;

  /**
   * Signing-bot base URL. Overridable via env in `e2eConfig`.
   */
  botUrl: string;

  /**
   * Worker-scoped bot-user session — create/attest on demand, DELETE on teardown.
   * Shared across all tests in the worker so repeated sign-ins on the same network
   * don't re-attest (30–60s on-chain cost).
   */
  botUserSession: BotUserSession;

  /**
   * Worker-scoped fixture for shared setup
   */
  workerFixture: void;
};

/** Projects whose worker-scoped session uses a permanent cross-run identity. */
const PERMANENT_WORKER_BASES: Partial<Record<string, string>> = {
  authenticated: 'desktopauthd',
  'product-sdk': 'desktopsdk',
};

/**
 * Extended test with custom fixtures
 */
export const test = bddTest.extend<TestFixtures, WorkerFixtures>({
  // Worker identity resolution, by project:
  //  - `BOT_USERNAME_<ROLE>` env pins any role for manual repro.
  //  - authenticated / product-sdk → PERMANENT deterministic user per worker
  //    slot (base + parallelIndex letter + OS suffix): attested once ever,
  //    instant ensure() afterwards. No setup project needed.
  //  - chat → per-run singleton from the setup-chat pool (worker 0), fresh
  //    random beyond it. Chat state must not bleed between runs.
  //  - auth (and anything else) → fresh random; auth scenarios that want the
  //    permanent identity declare it in the .feature via `as "desktopauth"`.
  botUsername: [
    // eslint-disable-next-line no-empty-pattern -- Playwright fixture signature requires destructuring
    async ({}, use, workerInfo) => {
      const role = workerInfo.project.name;
      const override = process.env[`BOT_USERNAME_${role.toUpperCase().replace(/-/g, '_')}`];
      if (override) {
        await use(override);
        return;
      }
      const permanentBase = PERMANENT_WORKER_BASES[role];
      if (permanentBase) {
        await use(permanentBotUsername(permanentBase, workerInfo.parallelIndex));
        return;
      }
      const pooled = role === 'chat' ? await readPoolUserForSlot('chat', workerInfo.parallelIndex) : undefined;
      await use(pooled ?? makeBotUsername());
    },
    { scope: 'worker' },
  ],

  botUrl: [e2eConfig.botUrl, { option: true, scope: 'worker' }],

  // Worker-scoped session: creates+attests on demand for fallback mode; cleanup
  // is centralised in the `teardown-bot-users` project (skipped here).
  botUserSession: [
    async ({ botUsername, botUrl }, use) => {
      const session = new BotUserSession(botUsername, botUrl, process.env['BOT_TOKEN']);
      await use(session);
      // Cleanup handled by the global teardown project; no per-worker DELETE.
    },
    { scope: 'worker' },
  ],

  // Worker fixture - runs once per worker
  workerFixture: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires object destructuring; no deps needed
    async ({}, use) => {
      // Setup worker-level resources
      console.info('🔧 Setting up worker...');
      await use();
      console.info('🧹 Cleaning up worker...');
    },
    { scope: 'worker' },
  ],

  // Autotest mode flag
  autotest: [false, { option: true }],

  // User data directory - creates a temporary directory for each test
  // eslint-disable-next-line no-empty-pattern -- Playwright requires object destructuring; no deps needed
  userDataDir: async ({}, use, testInfo) => {
    const tmpDir = path.join(os.tmpdir(), 'polkadot-desktop-e2e', `test-${testInfo.workerIndex}-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });

    await use(tmpDir);

    // Cleanup
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Failed to cleanup temp dir ${tmpDir}:`, error);
    }
  },

  // Electron app fixture
  electronApp: async ({ userDataDir, autotest }, use, testInfo) => {
    await setupPlatformParameter();
    const isRetry = testInfo.retry > 0;
    console.info(
      `🚀 Launching Electron app for test: ${testInfo.title} (autotest: ${autotest}${isRetry ? `, retry #${testInfo.retry}, recording video` : ''})`,
    );

    const videoDir = isRetry ? path.join(testInfo.outputDir, 'video') : undefined;
    if (videoDir) await fs.mkdir(videoDir, { recursive: true });

    const context = await launchElectronApp({
      userDataDir,
      autotest,
      botToken: process.env['BOT_TOKEN'],
      ...(videoDir ? { recordVideo: { dir: videoDir } } : {}),
    });

    // Clean slate — clear all storage before test actions
    await clearAppData(context.window);

    // Auto-approve transient product dialogs (permission requests, alias
    // requests) for the lifetime of this main page, so tests don't need to
    // know which products may pop them or when. Tests that need to assert on
    // the dialogs themselves opt out with the `@manual-permissions` Gherkin
    // tag in their .feature file.
    if (!testInfo.tags.includes('@manual-permissions')) {
      await registerProductDialogHandlers(context.window);
    }

    try {
      await use(context);
    } finally {
      await attachFailureScreenshot(context, testInfo);
      console.info(`🔚 Closing Electron for test: ${testInfo.title}`);
      await shutdownElectronApp(context);
      if (videoDir) await attachRecordedVideo(context, testInfo);
    }
  },
});

export { expect } from '@playwright/test';
