import 'dotenv/config';

import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

const sharedSteps = ['./e2e/steps/**/*.ts', './e2e/fixtures/base.ts'];

// Smoke tests — no auth, fresh Electron per test
const bddSmokeDir = defineBddConfig({
  outputDir: '.features-gen/smoke',
  features: ['./e2e/features/smoke/*.feature'],
  steps: sharedSteps,
});

// Link-navigation tests — no auth, fresh Electron per test, uses local HTTP fixture
const bddLinkNavDir = defineBddConfig({
  outputDir: '.features-gen/link-nav',
  features: ['./e2e/features/link-navigation/*.feature'],
  steps: [
    './e2e/steps/app.steps.ts',
    './e2e/steps/onboarding.steps.ts',
    './e2e/steps/link-navigation.steps.ts',
    './e2e/fixtures/link-tests.ts',
  ],
});

// Browser-chrome tests — no auth, fresh Electron per test. Reuses the link-tests
// local HTTP product (served on an ephemeral port) as a real product webview so
// find / zoom / history / tab features can be exercised without DotNS/IPFS/chain.
const bddBrowserDir = defineBddConfig({
  outputDir: '.features-gen/browser',
  features: ['./e2e/features/browser/*.feature'],
  steps: [
    './e2e/steps/app.steps.ts',
    './e2e/steps/onboarding.steps.ts',
    './e2e/steps/link-navigation.steps.ts',
    './e2e/steps/browser-zoom.steps.ts',
    './e2e/steps/browser-find.steps.ts',
    './e2e/steps/browser-history.steps.ts',
    './e2e/steps/browser-tabs.steps.ts',
    './e2e/steps/browser-navigation.steps.ts',
    './e2e/steps/browser-address-bar.steps.ts',
    './e2e/steps/browser-new-tab.steps.ts',
    './e2e/steps/browser-seed.steps.ts',
    './e2e/steps/browser-appearance.steps.ts',
    './e2e/steps/browser-onboarding.steps.ts',
    './e2e/fixtures/link-tests.ts',
  ],
});

// Auth flow tests — sign-in & logout, fresh Electron per test
const bddAuthDir = defineBddConfig({
  outputDir: '.features-gen/auth',
  features: ['./e2e/features/auth/*.feature'],
  steps: [...sharedSteps, './e2e/steps/auth.steps.ts'],
});

// Authenticated tests — worker-scoped session, sign-in once
const bddAuthenticatedDir = defineBddConfig({
  outputDir: '.features-gen/authenticated',
  // Grouped by feature area under authenticated/{dashboard,settings,products,networks,session}/
  features: ['./e2e/features/authenticated/**/*.feature'],
  steps: [
    './e2e/steps/authenticated.steps.ts',
    './e2e/steps/tab-switching.steps.ts',
    './e2e/steps/appearance.steps.ts',
    './e2e/steps/offline-access.steps.ts',
    './e2e/steps/settings.steps.ts',
    './e2e/steps/profile.steps.ts',
    './e2e/steps/network.steps.ts',
    './e2e/steps/product-actions.steps.ts',
    './e2e/steps/dashboard-auth.steps.ts',
    './e2e/steps/custom-chains.steps.ts',
    './e2e/steps/product-settings.steps.ts',
    './e2e/fixtures/authenticated.ts',
  ],
});

// Chat tests — all chat features grouped as one project, under e2e/features/chat/
//  - chat-p2p.feature        single Electron, contact search against bot peer (uses authenticatedTest)
//  - chat-p2p-pair.feature   two Electrons (Alice + Bob) full P2P flow (uses chatPairTest)
//  - coinflip-chat.feature   CoinFlip product widget + dashboard chat integration (uses authenticatedTest)
const bddChatDir = defineBddConfig({
  outputDir: '.features-gen/chat',
  features: ['./e2e/features/chat/*.feature'],
  steps: [
    './e2e/steps/authenticated.steps.ts',
    './e2e/steps/chat-p2p.steps.ts',
    './e2e/steps/chat-p2p-pair.steps.ts',
    './e2e/steps/chat-contact-search.steps.ts',
    './e2e/steps/coinflip-chat.steps.ts',
    './e2e/steps/chat-seeded.steps.ts',
    './e2e/steps/chat-add-to-dashboard.steps.ts',
    './e2e/fixtures/authenticated.ts',
    './e2e/fixtures/chatPair.ts',
  ],
});

// Product SDK tests — host-playground sandbox + product-integration features (Accounts, Signing, etc.)
const bddProductSdkDir = defineBddConfig({
  outputDir: '.features-gen/product-sdk',
  features: ['./e2e/features/product-sdk/*.feature'],
  steps: [
    './e2e/steps/authenticated.steps.ts',
    './e2e/steps/test-product-sdk.steps.ts',
    './e2e/steps/settings.steps.ts',
    './e2e/steps/permission-settings.steps.ts',
    './e2e/steps/permission-dialogs.steps.ts',
    './e2e/fixtures/test-product-sdk.ts',
  ],
});

/**
 * Playwright configuration for Electron E2E tests.
 *
 * Projects:
 *   smoke — no auth
 *   auth, authenticated, product-sdk — sign in with permanent deterministic
 *     identities (see e2e/helpers/bot-user.ts permanentBotUsername); no setup
 *     project dependency.
 *   chat — depends on `setup-chat` (per-run singleton + pair pool);
 *     `teardown-bot-users` runs after it completes.
 *   security — independent.
 *
 * Runs `fullyParallel` (`workers` env-overridable). The `authenticated` project
 * reuses one signed-in Electron per worker (soft-reset between tests via
 * `reset-state.ts`); `auth`/`smoke` stay fresh-per-test. `authenticated`/`product-sdk`
 * claim permanent deterministic identities by `parallelIndex` (no pool, no
 * cross-worker collision); only `chat` draws from the per-run bot-user pool.
 * chat-pair scenarios share Alice/Bob Electrons across tests in a worker via
 * chatPair.ts.
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e/tests',

  // Wipe stale bot-user pool file at the start of every invocation so per-project
  // setups merge into a clean slate (see e2e/setup/global-init.ts).
  globalSetup: './e2e/setup/global-init.ts',

  // Maximum time one test can run
  timeout: 60_000,

  // Maximum time to wait for test.expect()
  expect: {
    timeout: 5_000,
  },

  // Most projects run at this default worker count (their npm scripts pass no
  // `--workers`): authenticated, chat, product-sdk, link-navigation, browser.
  // - authenticated reuses one signed-in Electron per worker (soft-reset between
  //   tests), each drawing a distinct identity per `parallelIndex` from a
  //   pre-attested pool; product-sdk/chat build on the same worker-reuse (worker
  //   0 takes the role singleton, worker >0 attest a fresh identity; chat's pair
  //   tests also draw distinct pairs from the chat-pair pool).
  // - link-navigation/browser are no-auth, fresh-Electron-per-test with isolated
  //   per-worker userDataDirs — safe to parallelize (CI runs them on linux only).
  // Only smoke/auth/security pin `--workers=1`: security because concurrent
  // Electron teardown hangs on the macOS runner, auth to avoid concurrent
  // signing-bot pairing, smoke as a quick serial gate. Override with
  // `E2E_WORKERS` or the `--workers` CLI flag.
  fullyParallel: true,
  workers: process.env['E2E_WORKERS'] ? Number(process.env['E2E_WORKERS']) : process.env['CI'] ? 2 : '50%',

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env['CI'],

  // Retry on CI only
  retries: process.env['CI'] ? 1 : 0,

  // Reporter to use
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
    [
      'junit',
      {
        outputFile: 'test-results/junit.xml',
      },
    ],
    [
      'allure-playwright',
      {
        outputFolder: 'allure-results',
        detail: true,
        suiteTitle: false,
        environmentInfo: {
          node_version: process.version,
          platform: process.platform,
          runner_os: process.env['RUNNER_OS'] ?? process.platform,
          architecture: process.arch,
          github_run_id: process.env['GITHUB_RUN_ID'],
          github_run_number: process.env['GITHUB_RUN_NUMBER'],
          github_ref: process.env['GITHUB_REF_NAME'],
          github_sha: process.env['GITHUB_SHA'],
          ci: process.env['CI'] ?? 'false',
        },
      },
    ],
  ],

  // Shared settings for all the projects below
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // 0. Chat's bot-user setup. auth/authenticated/product-sdk sign in with
    //    permanent deterministic identities (see e2e/helpers/bot-user.ts) and
    //    need no per-run setup project; chat still provisions a per-run
    //    singleton + pair pool, so it keeps its own setup + the shared teardown.
    {
      name: 'setup-chat',
      testMatch: '**/chat.setup.ts',
      testDir: './e2e/setup',
      // Chat provisions 1 singleton + N pairs (default 6 → 13 users) in parallel;
      // attestation finality polling can take ~60–90s total.
      timeout: 240_000,
      teardown: 'teardown-bot-users',
    },
    {
      name: 'teardown-bot-users',
      testMatch: '**/bot-users.teardown.ts',
      testDir: './e2e/setup',
      timeout: 60_000,
    },

    // 1. Smoke tests — no auth, fresh Electron per test
    {
      name: 'smoke',
      testDir: bddSmokeDir,
      use: {
        ...devices['Desktop Chrome'],
      },
    },

    // 2. Auth flow tests — sign-in & logout, fresh Electron per test
    {
      name: 'auth',
      testDir: bddAuthDir,
      timeout: 180_000,
      use: {
        ...devices['Desktop Chrome'],
        // @ts-expect-error -- custom fixture option from e2e/fixtures/base.ts
        autotest: true,
      },
    },

    // 3. Authenticated tests — one signed-in Electron reused per worker, with a
    //    soft-reset to a clean /dashboard baseline before each test (see
    //    e2e/fixtures/authenticated.ts + e2e/helpers/reset-state.ts). `@isolated`
    //    scenarios opt out to a throwaway fresh app + own sign-in. Timeout stays
    //    high because the per-worker first sign-in plus heavy scenarios (e.g.
    //    tab-switching opens 7 tabs) still run a few minutes.
    {
      name: 'authenticated',
      testDir: bddAuthenticatedDir,
      timeout: 300_000,
      use: {
        ...devices['Desktop Chrome'],
        // @ts-expect-error -- custom fixture option from e2e/fixtures/base.ts
        autotest: true,
      },
    },

    // 4. Product SDK tests — host-playground sandbox tests on authenticated session
    {
      name: 'product-sdk',
      testDir: bddProductSdkDir,
      timeout: 180_000,
      use: {
        ...devices['Desktop Chrome'],
        // @ts-expect-error -- custom fixture option from e2e/fixtures/base.ts
        autotest: true,
      },
    },

    // 5. Chat tests — all chat flows (single-client contact search + two-client P2P pair)
    {
      name: 'chat',
      testDir: bddChatDir,
      // chat-p2p-pair does two sign-ins + chat handshake round-trips.
      // chat-p2p is much quicker but shares the timeout.
      timeout: 600_000,
      dependencies: ['setup-chat'],
      use: {
        ...devices['Desktop Chrome'],
        // @ts-expect-error -- custom fixture option from e2e/fixtures/base.ts
        autotest: true,
      },
    },

    // 6. Security tests — independent, own fixture system
    {
      name: 'security',
      testDir: './e2e/tests',
      use: {
        ...devices['Desktop Chrome'],
      },
      testMatch: /security\/.*\.e2e\.ts/,
    },

    // 6. Link-navigation tests — independent, uses local HTTP fixture (no auth)
    {
      name: 'link-navigation',
      testDir: bddLinkNavDir,
      use: {
        ...devices['Desktop Chrome'],
      },
    },

    // 7. Browser-chrome tests — independent, no auth, link-tests local product
    {
      name: 'browser',
      testDir: bddBrowserDir,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],

  // Output folder for test artifacts
  outputDir: 'test-results',
  snapshotPathTemplate: '{testDir}/__snapshots__/{testFilePath}/{arg}{-projectName}{-snapshotSuffix}{ext}',
});
