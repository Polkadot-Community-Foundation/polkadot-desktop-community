# E2E Tests

BDD-style end-to-end tests for the Polkadot Desktop Electron app using [Playwright](https://playwright.dev/) and [playwright-bdd](https://github.com/vitalets/playwright-bdd) with Gherkin syntax.

## Architecture

```
                         ┌─────────────────────────────────────────────┐
                         │             playwright.config.ts            │
                         │                                             │
                         │  defineBddConfig() x3 → .features-gen/     │
                         │  projects: smoke → auth → authenticated     │
                         │  fullyParallel, workers env-overridable     │
                         └─────────────┬───────────────────────────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              ▼                        ▼                        ▼
     ┌────────────────┐     ┌──────────────────┐     ┌──────────────────┐
     │     smoke      │     │      auth        │     │  authenticated   │
     │                │     │                  │     │                  │
     │ app-launch     │     │ sign-in          │     │ authenticated-   │
     │ onboarding     │────▶│ logout           │────▶│ session          │
     │ main-view      │deps │                  │deps │                  │
     │                │     │ Fresh Electron   │     │ Shared Electron  │
     │ Fresh Electron │     │ per test         │     │ per WORKER +     │
     │ per test       │     │ AUTOTEST=true    │     │ soft-reset/test  │
     └───────┬────────┘     └────────┬─────────┘     └────────┬─────────┘
             │                       │                         │
             ▼                       ▼                         ▼
     ┌────────────────┐     ┌──────────────────┐     ┌──────────────────┐
     │ fixtures/      │     │ fixtures/        │     │ fixtures/        │
     │ base.ts        │     │ base.ts          │     │ authenticated.ts │
     │                │     │                  │     │                  │
     │ electronApp    │     │ electronApp      │     │ authenticatedApp │
     │ (test-scoped)  │     │ (test-scoped)    │     │ (worker reuse /  │
     │                │     │                  │     │  @isolated fresh)│
     └───────┬────────┘     └────────┬─────────┘     └────────┬─────────┘
             │                       │                         │
             ▼                       ▼                         ▼
   ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────────────┐
   │ Electron Process │   │ Electron Process │   │ Worker Electron (1×)      │
   │ clearAppData()   │   │ clearAppData()   │   │ sign in once, then per    │
   │ Fresh storage    │   │ Fresh storage    │   │ test: resetToAuthenticated│
   │ Unique dataDir   │   │ Unique dataDir   │   │ Baseline() — wipe per-test│
   └──────────────────┘   └──────────────────┘   │ stores, keep session,     │
                                                  │ reload → /dashboard.      │
                                                  │ Crash/logout → relaunch + │
                                                  │ re-sign-in fallback.      │
                                                  └──────────────────────────┘
```

## Directory Structure

```
e2e/
├── features/               Gherkin .feature files — one folder per project; glob-registered
│   ├── smoke/                 @smoke   app-launch, onboarding, main-view, address-bar, sandbox-health
│   ├── auth/                  @auth    sign-in, session-identity, onboarding-network
│   ├── authenticated/         @authenticated — grouped by feature area (glob: authenticated/**/*.feature)
│   │   ├── dashboard/             dashboard, product-widgets
│   │   ├── settings/              settings, appearance, profile
│   │   ├── products/              product-actions, product-cache, product-settings
│   │   ├── networks/              network, custom-chains
│   │   └── session/               authenticated-session, offline-access, quickchat, tab-switching
│   ├── link-navigation/       @link-navigation   host-router/webview navigation (local HTTP fixture)
│   ├── browser/               @browser   zoom, find, history, tabs, new-tab, address-bar, … (no auth)
│   ├── chat/                  @chat — three flavours (single-client, Alice+Bob pair, seeded)
│   │   ├── chat-p2p.feature           P2P contact search against bot peer
│   │   ├── chat-p2p-pair.feature      Alice + Bob 2-client P2P chat
│   │   ├── chat-seeded.feature        Seeded chat rooms (display/actions, no live P2P)
│   │   └── coinflip-chat.feature      CoinFlip product widget + dashboard chat integration
│   └── product-sdk/           @product-sdk — host-playground sandbox + product integrations
│       ├── accounts.feature       Accounts API tests
│       └── signing.feature        Signing API tests
│   (security probes are TypeScript specs in e2e/tests/security/*.e2e.ts, not Gherkin)
├── steps/                  Step definitions (Given/When/Then implementations)
│   ├── app.steps.ts            App launch steps
│   ├── onboarding.steps.ts     QR code, skip onboarding
│   ├── dashboard.steps.ts      Dashboard, theme, chat, settings, screenshots
│   ├── auth.steps.ts           Sign-in, logout, localStorage checks
│   ├── authenticated.steps.ts  Shared session steps
│   ├── chat-p2p.steps.ts       Contact search vs. bot peer
│   ├── chat-p2p-pair.steps.ts  Alice + Bob 2-client chat actions
│   ├── coinflip-chat.steps.ts  CoinFlip widget add + dashboard chat send (@chat project)
│   ├── offline-access.steps.ts Product actions menu + enable offline access flow
│   └── test-product-sdk.steps.ts  Product SDK shared steps (navigate, run action, confirm signing)
├── page-objects/           Page Object pattern
│   ├── OnboardingPage.ts       QR, skip, signing bot panel
│   ├── DashboardPage.ts        Theme, chat, settings, user button, edit mode, screenshots
│   ├── ChatPage.ts             Chat widget, fullscreen, session selection, message sending, reactions
│   ├── ContactSearchPage.ts    Chat contact search (username/SS58 direct-connect, welcome, send request)
│   ├── UserPopover.ts          Username, logout
│   ├── ProductActionsPage.ts   Product actions menu (•••), offline access confirm, pin indicator
│   └── TestProductPage.ts      Product webview interaction (navigation, categories, actions, signing)
├── fixtures/               Playwright test fixtures
│   ├── base.ts                 Test-scoped Electron (fresh per test); worker-scoped bot identity (per parallelIndex)
│   ├── authenticated.ts        Worker-scoped signed-in Electron reused across tests via soft-reset; @isolated → throwaway fresh app + sign-in
│   ├── chatPair.ts             Test-scoped Alice + Bob Electrons drawn from a pool of pre-attested pairs
│   ├── test-product-sdk.ts     Authenticated + TestProductPage fixture
│   └── security.ts             Security probe fixtures
├── helpers/                Utility functions
│   ├── electron.ts             Launch/close Electron, menu clicks
│   ├── dotns.ts                Per-environment dotNS TLD + `productName(label, tld)` — the only place a suffix is spelled
│   ├── seed-products.ts        Pre-launch product / recents / dashboard-layout seeding (raw IndexedDB + localStorage; reload to apply)
│   ├── reset-state.ts          Soft-reset the shared worker session to a clean authenticated /dashboard baseline (restore the post-sign-in storage snapshot + reload; relaunch+re-sign-in fallback)
│   ├── dialogs.ts              Flag-gated permission/alias dialog auto-approver (per-test toggle on the shared page)
│   ├── cleanup.ts              Clear localStorage, IndexedDB before tests (fresh-per-test projects)
│   ├── chatBotClient.ts        HTTP client for signing-bot chat API (ensure peer / discovery / send messages)
│   ├── chatState.ts            Reset Dexie p2p-chat DB + navigate to dashboard
│   ├── wait.ts                 Wait utilities (idle, selector, retry)
│   ├── assertions.ts           Custom Playwright assertions
│   └── webview.ts              Product injection for security tests
├── setup/                  Infra project — chat bot-user provisioning + shared teardown (auth/authenticated/
│   │                         product-sdk sign in with permanent deterministic identities, no setup needed)
│   ├── bot-user-pool.ts       Pool file storage + chat-pair size constant (zod-validated)
│   ├── bot-users.shared.ts    `provisionRoles()` helper that merges into the pool
│   ├── global-init.ts         `globalSetup` — wipes stale pool file at invocation start
│   ├── chat.setup.ts          Provisions `chat` singleton + N chat pairs
│   └── bot-users.teardown.ts  Parallel DELETE of everything in the pool, removes pool file
├── test-products/          Test products for security probes
└── tests/
    ├── record.e2e.ts       Standalone recorder script (Playwright Inspector)
    └── security/           Security tests (non-BDD, own fixtures)
```

## Test Projects

| Project           | Tag              | Fixture                                                                | Isolation                                                                                                           | Use Case                                                                                                                                                                   |
| ----------------- | ---------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smoke`           | `@smoke`         | `electronApp` (test-scoped)                                            | Fresh Electron per test                                                                                             | Basic app functionality                                                                                                                                                    |
| `auth`            | `@auth`          | `electronApp` (test-scoped)                                            | Fresh Electron per test                                                                                             | Sign-in, logout flows                                                                                                                                                      |
| `authenticated`   | `@authenticated` | `authenticatedApp` (worker reuse)                                      | One signed-in Electron per worker + soft-reset before each test (`@isolated` → throwaway fresh app + sign-in)       | Tests requiring active session                                                                                                                                             |
| `product-sdk`     | `@product-sdk`   | `testProductPage` + `authenticatedApp` (worker reuse)                  | Inherits authenticated worker reuse + soft-reset; webview per test                                                  | Product SDK sandbox + product-integration tests (Accounts, Signing)                                                                                                        |
| `chat`            | `@chat`          | `authenticatedApp` (single-client) + `alice`/`bob` (pair, test-scoped) | Fresh Electron per test everywhere; chat-pair scenarios also get a fresh `{alice, bob}` identity pair from the pool | All chat tests: single-client contact search (`chat-p2p.feature`), two-client P2P pair (`chat-p2p-pair.feature`), CoinFlip dashboard integration (`coinflip-chat.feature`) |
| `security`        | —                | `securityTest` (worker-scoped)                                         | Probe-based                                                                                                         | Sandbox isolation tests                                                                                                                                                    |
| `link-navigation` | `@smoke`         | `electronApp` + `linkTestsTarget` (worker-scoped local HTTP)           | Fresh Electron per test                                                                                             | Host-router ↔ in-product navigation sync (no auth/chain)                                                                                                                   |
| `browser`         | `@browser`       | `electronApp` + `linkTestsTarget` (worker-scoped local HTTP)           | Fresh Electron per test                                                                                             | Browser-chrome features (zoom, find, history, tabs) against TestOps plan 900 — link-tests product, no auth/chain                                                           |

Plus two infra projects that run around the `chat` suite. `auth`, `authenticated`, and `product-sdk` sign in with
permanent deterministic identities (see "Bot identities" below) and need no per-run setup project at all:

| Project              | Purpose                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `setup-chat`         | Provisions the `chat` singleton + `CHAT_PAIR_POOL_SIZE` Alice/Bob pairs. Dependency of `chat`.                                      |
| `teardown-bot-users` | DELETEs every user written to the pool and removes the pool file. Triggered via `teardown:` on `setup-chat` — runs once at the end. |

Execution order via `dependencies`: **setup-chat → chat → teardown-bot-users**. Running `--project=auth` (or
`authenticated` / `product-sdk`) pays no setup cost — those sign in with a permanent identity that's already
attested after its first-ever run. `globalSetup` (`e2e/setup/global-init.ts`) wipes a stale pool file at every
invocation start. Smoke and security are independent — no bot-user provisioning.

## Product names and the network TLD

The dotNS suffix is per deployment ([paritytech/dotns#201](https://github.com/paritytech/dotns/issues/201)): the app reads it
from `DotnsProtocolRegistry.tld()` at runtime, so `host-playground` is `host-playground.paseo` on Paseo Next V2 and a
different name elsewhere. Tests therefore never spell a suffix — a `.feature` file names the **label** and the step
completes it with `productName(label, tld)` from `e2e/helpers/dotns.ts`.

The same applies to the served `link-tests` fixture: its cross-product `polkadot://` href is written as
`polkadot://cross-product-target{{TLD}}/home` and `startStaticServer` substitutes the suffix when it serves `index.html`.

That helper owns the whole mapping: `nightly` → `.paseo`, `unstable` → the app's fallback. The no-auth projects
(`browser`, `link-navigation`) _skip_ the onboarding picker rather than opting out of an environment, so its default stays
selected and the app resolves that network's TLD there too — they seed through `DEFAULT_ENVIRONMENT_ID`. When a deployment's TLD changes, this map is the only
edit; `E2E_DOTNS_TLD=.paseo` overrides it for a single run (validated against the same shape the app accepts off-chain, and
it does not move the fallback).

## Bot identities

`auth`, `authenticated`, and `product-sdk` sign in with **permanent deterministic identities** — attested once,
ever; every later run is an instant `ensure()` check instead of a 30–60s on-chain attestation. No per-run setup
project, no pool. Name layout: `<base><workerLetter?><osSuffix>` (`permanentBotUsername()` in
`e2e/helpers/bot-user.ts`):

| Role            | Base           | Declared                                                                                                                |
| --------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `auth`          | `desktopauth`  | In the `.feature` file, via `… via signing bot on "nightly" as "desktopauth"` (no-`as` variant → fresh random identity) |
| `authenticated` | `desktopauthd` | Fixture constant (`PERMANENT_WORKER_BASES` in `e2e/fixtures/base.ts`)                                                   |
| `product-sdk`   | `desktopsdk`   | Fixture constant (`PERMANENT_WORKER_BASES` in `e2e/fixtures/base.ts`)                                                   |

The worker letter (`a`, `b`, … from `parallelIndex`) keeps concurrent workers on distinct identities; the OS
suffix (`macos` / `windows` / `linux`) keeps the 3-OS CI matrix on separate daily allowance-slot budgets
(`Resources.LiteStmtStoreSlotsPerPeriod = 10`/user/day) and out of each other's session-list assertions.

**Heal.** A permanent user wedged in pairing (`StuckPairingError` — a chain redeploy that wiped personhood) or
rejected with the "Limit Reached" no-free-slots error (`PairingLimitError` — an exhausted daily allowance-slot
budget, detected fast from the onboarding error panel instead of burning the full navigation timeout) can't be
fixed by retrying, so `signInWithHeal` (`e2e/helpers/sign-in.ts`) deletes it on the bot and falls back to a
freshly generated identity for the rest of the run; the next run recreates the permanent user with one clean
attestation. The signing bot additionally evicts the oldest device registration when the budget is exhausted
(LRU replacement via `set_statement_store_account`), so the limit should only surface against an outdated bot.

`chat` is the one holdout — it still provisions **fresh random users per run** via the pool below, because
on-chain chat/statement-store state must not bleed between scenarios or runs.

### Bot user pool (chat only)

`setup-chat` pre-attests one `chat` singleton + `CHAT_PAIR_POOL_SIZE` Alice/Bob pairs into a pool file, consumed
by worker fixtures and removed by `teardown-bot-users`:

| Kind           | Shape                                                                       | Consumers                                    | Lookup                                       |
| -------------- | --------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------- |
| Chat singleton | `users: { chat }`                                                           | `botUsername` fixture in `base.ts`           | `readPoolUserForSlot('chat', parallelIndex)` |
| Chat pairs     | `chatPairs: Array<{alice, bob}>` of `CHAT_PAIR_POOL_SIZE` items (default 6) | `chatPair.ts` — test-scoped `pairAssignment` | Next unused slot via `chatPairCounter`       |

The chat singleton goes only to worker 0 (`readPoolUserForSlot` returns `undefined` for `parallelIndex > 0`, so
further parallel workers generate + attest a fresh identity instead of colliding on it). Each chat-pair test
consumes a **fresh slot** so append-only statement-store requests never leak between scenarios or retries;
budget `scenarios × (1 + retries)`. Override the pair count via `CHAT_PAIR_POOL_SIZE`.

Fallback when the pool file is missing (`playwright test --ignore-project-dependencies` or after a failed
setup): the `chat` fixture generates a random username + lazy-attests via `BotUserSession.ensure()` — slow,
leaks on crash, useful only for debugging. `auth`/`authenticated`/`product-sdk` need no such fallback — their
permanent identity is computed the same way on every run.

Env overrides (manual repro):

- `BOT_USERNAME` — fallback override for `base.ts`'s fresh-random identity generation only (e.g. the `auth`
  project's no-`as` step, or the `chat` fallback beyond the pool). It does NOT affect the `authenticated` /
  `product-sdk` permanent deterministic identities — those are overridden per-role via
  `BOT_USERNAME_AUTHENTICATED` / `BOT_USERNAME_PRODUCT_SDK` instead. The auth project's Gherkin `as "desktopauth"`
  steps compute the permanent name directly and ignore env overrides entirely.
- `BOT_USERNAME_AUTH` / `BOT_USERNAME_AUTHENTICATED` / `BOT_USERNAME_PRODUCT_SDK` / `BOT_USERNAME_CHAT` —
  per-role pin, checked before the permanent-identity / pool lookup
- `E2E_WORKERS` / `--workers` — worker count (default `CI ? 2 : '50%'`)
- Chat-pair identities are _not_ env-pinnable (different slot per scenario). Edit the pool file or drop
  pool-mode for manual repro.

## Recording Tests

Use the built-in recorder to capture actions in the Electron app via Playwright Inspector:

```bash
npm run test:e2e:record
```

This launches the Electron app with `PWDEBUG=1` and calls `page.pause()`, which opens **Playwright Inspector**.

1. Click the **"Record"** button in the Inspector toolbar
2. Interact with the app — clicks, typing, navigation are all recorded
3. Copy the generated code from the Inspector
4. Adapt the recorded code into BDD format: `.feature` file + step definitions + Page Object

> **Note:** Product content runs inside an Electron `<webview>`, which Playwright exposes as a separate window. After navigating to a product, use `app.windows()` or `app.waitForEvent('window')` to get the webview page for interaction. See `TestProductPage` for a working example.

## How to Write a New Test

### 1. Create or update a .feature file

```gherkin
@smoke @allure.label.parentSuite:smoke @allure.label.suite:My_Feature
Feature: My Feature

  Scenario: Something works
    Given the app is launched
    When the user does something
    Then something happens
```

- `@smoke` / `@auth` / `@authenticated` — determines which project runs it
- `@allure.label.parentSuite:` — Allure report grouping (must match project name)
- `@allure.label.suite:` — Allure sub-group name

### 2. Add step definitions

```typescript
// e2e/steps/my.steps.ts
import { createBdd } from 'playwright-bdd';
import { test, expect } from '../fixtures/base';

const { Given, When, Then } = createBdd(test);

When('the user does something', async ({ electronApp }) => {
  // Use Page Objects, not raw selectors
  const page = new MyPage(electronApp.window);
  await page.doSomething();
});
```

For authenticated tests, use `authenticatedTest` and `authenticatedApp`:

```typescript
import { createBdd } from 'playwright-bdd';
import { authenticatedTest } from '../fixtures/authenticated';

const { Given, Then } = createBdd(authenticatedTest);

Given('the user is authenticated', async ({ authenticatedApp }) => {
  await authenticatedApp.window.waitForURL(/dashboard/);
});
```

### 3. Use Page Objects

```typescript
// e2e/page-objects/MyPage.ts
import { type Page, expect } from '@playwright/test';
import { TEST_IDS } from '@/shared/test-ids';

export class MyPage {
  constructor(private readonly page: Page) {}

  get myButton() {
    return this.page.getByTestId(TEST_IDS.myButton);
  }

  async clickMyButton() {
    await expect(this.myButton).toBeVisible({ timeout: 5_000 });
    await this.myButton.locator('button').click();
  }
}
```

### 4. Add data-testid to components

All test IDs live in `src/shared/test-ids.ts` — single source of truth for both app and tests.

```typescript
// src/shared/test-ids.ts
export const TEST_IDS = {
  myButton: 'my-button',
} as const;
```

Since `HeaderButton` and some UI kit components don't forward rest props, wrap with a `<div>`:

```tsx
<div data-testid={TEST_IDS.myButton}>
  <HeaderButton variant="icon" onClick={handleClick}>
    <Icon />
  </HeaderButton>
</div>
```

### 5. Attach screenshots

```gherkin
Then the dashboard screenshot is taken as "my-screenshot"
```

Step implementation uses `$testInfo` fixture:

```typescript
Then('the dashboard screenshot is taken as {string}', async ({ electronApp, $testInfo }, name: string) => {
  const screenshot = await electronApp.window.screenshot();
  await $testInfo.attach(name, { body: screenshot, contentType: 'image/png' });
});
```

### 6. Register in playwright.config.ts

Each `defineBddConfig()` registers its project's feature folder with a **glob**, so a new `.feature` is auto-detected
once placed in the matching folder — no config change for new feature files:

```typescript
const bddSmokeDir = defineBddConfig({
  features: ['./e2e/features/smoke/*.feature'],
  steps: sharedSteps,
});
const bddAuthenticatedDir = defineBddConfig({
  features: ['./e2e/features/authenticated/**/*.feature'], // recursive — nested by feature area
  steps: [/* ... */],
});
```

Only edit `playwright.config.ts` when adding a **new project** (new folder + `defineBddConfig` + a `projects` entry)
or when a feature needs a new step file added to the project's `steps:` array.

### 7. Regenerate and run

```bash
npm run build:e2e                # Build with AUTOTEST=true, RENDERER_SOURCE=filesystem
rm -rf .features-gen && npx bddgen  # Regenerate specs from .feature files
npm run test:e2e:all             # Run all: smoke, auth, authenticated, product-sdk, chat, link-navigation, browser
```

## Commands

```bash
npm run build:e2e              # Build app for e2e (AUTOTEST + filesystem renderer)
npm run test:e2e:gen           # Regenerate BDD specs from .feature files
npm run test:e2e               # Run smoke tests only
npm run test:e2e:auth          # Run auth tests only (sign-in, logout)
npm run test:e2e:authenticated # Run authenticated session tests only
npm run test:e2e:product-sdk   # Run product SDK tests (Accounts, Signing, etc.)
npm run test:e2e:chat          # Run all chat tests (contact search + two-client Alice+Bob pair)
npm run test:e2e:all           # Run all BDD tests (smoke, auth, authenticated, product-sdk, chat, link-navigation, browser)
npm run test:e2e:link-navigation # Host-router navigation tests (local HTTP fixture, no auth)
npm run test:e2e:browser       # Browser-chrome tests (zoom, find, … — link-tests product, no auth)
npm run test:e2e:security      # Run security probe tests
npm run test:e2e:ui            # Playwright interactive UI mode
npm run test:e2e:record        # Launch Electron with Playwright Inspector for recording
npm run test:e2e:report        # Open HTML report
```

## Key Conventions

- **Page Objects over raw selectors** — all UI interaction goes through page objects
- **`TEST_IDS` for data-testid** — shared between `src/` components and `e2e/` tests
- **`clearAppData()` before every test** — fresh-per-test projects (smoke/auth/`@isolated`); the `authenticated` worker session uses the soft-reset (`reset-state.ts`) instead
- **`fullyParallel`, `workers` env-overridable** — `authenticated` reuses one signed-in Electron per worker (soft-reset between tests); each worker claims its own permanent deterministic identity by `parallelIndex` (see "Bot identities"), so parallel workers don't collide on chain. `auth`/`smoke` stay fresh-per-test
- **Allure tags in .feature files** — `@allure.label.parentSuite:` and `@allure.label.suite:` control report hierarchy
- **`suiteTitle: false`** in Allure config — suite names come only from Gherkin tags, not file paths
- **`BOT_TOKEN` at build time** — signing bot auth token baked into the e2e build
- **Cucumber VS Code extension** — configured via `.vscode/settings.json` for step navigation

## Keeping Docs Up to Date

This directory has two documentation files — keep them in sync with code changes:

- **`CLAUDE.md`** — rules and patterns for AI-assisted test writing. Update when changing conventions, fixture API, or step
  patterns.
- **`README.md`** (this file) — architecture, directory structure, and developer guide. Update when changing structure, adding
  projects, or modifying execution flow.

| What changed                      | What to update                                      |
| --------------------------------- | --------------------------------------------------- |
| New test project                  | Both docs + `playwright.config.ts` + `package.json` |
| New fixture or fixture API change | Both docs                                           |
| New Page Object                   | `README.md` (directory structure section)           |
| New convention or rule            | `CLAUDE.md` (Rules section)                         |
| New npm script                    | Both docs + root `CLAUDE.md` (Commands section)     |
| New `data-testid`                 | `src/shared/test-ids.ts` only                       |
| Architecture change (diagram)     | `README.md` (Architecture section)                  |
