import { type Page, expect } from '@playwright/test';

import { TEST_IDS } from '@/shared/test-ids';
import { type E2eEnvironmentId } from '../helpers/environment';
import { DEFAULT_TIMEOUT } from '../helpers/timeouts';

// The QR centre logo renders at ~24px; the QR matrix is far larger. Any width above this
// means the matrix (not just the logo) has rendered.
const QR_LOGO_MAX_WIDTH = 100;

export class OnboardingPage {
  constructor(private readonly page: Page) {}

  get qrContainer() {
    return this.page.getByTestId(TEST_IDS.onboardingQrContainer);
  }

  get qrSvg() {
    return this.qrContainer.locator('svg');
  }

  get skipButton() {
    return this.page.getByTestId(TEST_IDS.onboardingSkip);
  }

  get signingBotPanel() {
    return this.page.getByTestId(TEST_IDS.signingBotPanel);
  }

  /**
   * The "Completing pairing…" spinner shown while the handshake is mid-flight
   * (`handshakeState.tag === 'Pending'`). When nightly attestation lags, the
   * pairing wedges here indefinitely instead of redirecting to `/dashboard`;
   * the sign-in helper watches this to abort a stuck attempt early.
   */
  get completingPairing() {
    return this.page.getByTestId(TEST_IDS.onboardingCompletingPairing);
  }

  /**
   * The pairing-failed panel (`handshakeState.tag === 'Failed'`). Carries a
   * `data-error-kind` attribute: `noFreeSlots` is the "Limit Reached" case —
   * the peer reported no free allowance slots (the bot user's daily
   * device-registration budget is exhausted); everything else is `generic`.
   */
  get pairingError() {
    return this.page.getByTestId(TEST_IDS.onboardingPairingError);
  }

  /**
   * The "Limit Reached" flavor of {@link pairingError}. No same-identity retry
   * can clear it within a run — the sign-in helper watches this to fail fast
   * with `PairingLimitError` instead of burning the full navigation timeout.
   */
  get pairingLimitReachedError() {
    return this.page.locator(`[data-testid="${TEST_IDS.onboardingPairingError}"][data-error-kind="noFreeSlots"]`);
  }

  get signingBotUrlInput() {
    return this.page.getByTestId(TEST_IDS.signingBotUrlInput);
  }

  get signingBotTokenInput() {
    return this.page.getByTestId(TEST_IDS.signingBotTokenInput);
  }

  get signingBotConnectButton() {
    return this.page.getByTestId(TEST_IDS.signingBotConnect);
  }

  get signingBotStatus() {
    return this.page.getByTestId(TEST_IDS.signingBotStatus);
  }

  get signingBotUsernameInput() {
    return this.page.getByTestId(TEST_IDS.signingBotUsernameInput);
  }

  get signingBotReachable() {
    return this.page.getByTestId(TEST_IDS.signingBotReachable);
  }

  get signingBotUnreachable() {
    return this.page.getByTestId(TEST_IDS.signingBotUnreachable);
  }

  /** The actual <button> inside the connect-action wrapper div. */
  get signingBotConnectInnerButton() {
    return this.signingBotConnectButton.locator('button');
  }

  /** Fill the bot URL field (used to drive the health-check indicator). */
  async fillBotUrl(botUrl: string) {
    await expect(this.signingBotPanel).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await this.signingBotUrlInput.fill(botUrl);
  }

  async expectBotReachable() {
    await expect(this.signingBotReachable).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  }

  async expectBotUnreachable() {
    await expect(this.signingBotUnreachable).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  }

  async expectConnectDisabled() {
    await expect(this.signingBotConnectInnerButton).toBeDisabled({ timeout: DEFAULT_TIMEOUT });
  }

  async expectConnectEnabled() {
    await expect(this.signingBotConnectInnerButton).toBeEnabled({ timeout: DEFAULT_TIMEOUT });
  }

  async waitForQrCode() {
    await expect(this.qrContainer).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    // QR may render as <svg> or <canvas> depending on the library config
    const qrContent = this.qrContainer.locator('svg, canvas');
    await expect(qrContent.first()).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  }

  async getQrDimensions() {
    const content = this.qrContainer.locator('svg, canvas');

    // The QR box contains more than one element: the QR matrix plus the small centre
    // logo (~24px), and the logo renders a beat BEFORE the matrix. Measuring the
    // largest element naively races that gap and can pick up the logo. Poll until the
    // matrix has actually rendered (largest element clearly bigger than the logo),
    // then return its dimensions for the caller to assert on.
    let dimensions = { width: 0, height: 0 };
    await expect
      .poll(
        async () => {
          dimensions = await content.evaluateAll(elements =>
            elements
              .map(element => {
                const rect = element.getBoundingClientRect();

                return { width: rect.width, height: rect.height };
              })
              .reduce(
                (largest, current) => (current.width * current.height > largest.width * largest.height ? current : largest),
                { width: 0, height: 0 },
              ),
          );

          return dimensions.width;
        },
        { timeout: DEFAULT_TIMEOUT },
      )
      .toBeGreaterThan(QR_LOGO_MAX_WIDTH);

    return dimensions;
  }

  async skipOnboarding() {
    await this.skipButton.locator('button').click({ timeout: DEFAULT_TIMEOUT });
    await this.page.waitForURL(/dashboard/, { timeout: DEFAULT_TIMEOUT });
  }

  networkButton(environmentId: E2eEnvironmentId) {
    return this.page.getByTestId(`${TEST_IDS.networkButton}-${environmentId}`);
  }

  /**
   * Assert the onboarding network selector has `environmentId` selected, and that
   * it is the ONLY selected segment. The active segment carries `aria-pressed=true`
   * (driven by `settings.environmentId === env.id` in OnboardingScreen).
   */
  async expectSelectedEnvironment(environmentId: E2eEnvironmentId) {
    await expect(this.networkButton(environmentId)).toHaveAttribute('aria-pressed', 'true', {
      timeout: DEFAULT_TIMEOUT,
    });
    const selected = this.page.locator(`[data-testid^="${TEST_IDS.networkButton}-"][aria-pressed="true"]`);
    await expect(selected).toHaveCount(1, { timeout: DEFAULT_TIMEOUT });
  }

  /** All environment ids the onboarding picker currently offers (from the `network-button-<id>` testids). */
  async availableEnvironmentIds(): Promise<string[]> {
    const prefix = `${TEST_IDS.networkButton}-`;
    const buttons = this.page.locator(`[data-testid^="${prefix}"]`);
    await expect(buttons.first()).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    const ids: string[] = [];
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const testId = await buttons.nth(i).getAttribute('data-testid');
      if (testId?.startsWith(prefix)) ids.push(testId.slice(prefix.length));
    }
    return ids;
  }

  /** The currently selected environment id, or null if none is pressed. */
  async selectedEnvironmentId(): Promise<string | null> {
    const prefix = `${TEST_IDS.networkButton}-`;
    const pressed = this.page.locator(`[data-testid^="${prefix}"][aria-pressed="true"]`);
    if ((await pressed.count()) === 0) return null;
    const testId = await pressed.first().getAttribute('data-testid');
    return testId ? testId.slice(prefix.length) : null;
  }

  /**
   * Switch to any environment other than the currently selected one and return its id.
   * Triggers a reload, so callers must re-wait for the QR afterwards. Assumes ≥2
   * environments are configured (callers should skip otherwise — CI builds may ship one).
   */
  async switchToDifferentEnvironment(): Promise<string> {
    const ids = await this.availableEnvironmentIds();
    const current = await this.selectedEnvironmentId();
    const target = ids.find(id => id !== current);
    if (!target) throw new Error(`No alternative environment to switch to (available: ${ids.join(', ')})`);
    await this.page.getByTestId(`${TEST_IDS.networkButton}-${target}`).click();
    await this.page.waitForLoadState('domcontentloaded');
    await expect(this.page.locator('body')).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    return target;
  }

  /** Assert exactly one environment is selected and it is NOT `environmentId`. */
  async expectSelectedEnvironmentChangedFrom(environmentId: E2eEnvironmentId) {
    const prefix = `${TEST_IDS.networkButton}-`;
    const selected = this.page.locator(`[data-testid^="${prefix}"][aria-pressed="true"]`);
    await expect(selected).toHaveCount(1, { timeout: DEFAULT_TIMEOUT });
    await expect(this.networkButton(environmentId)).not.toHaveAttribute('aria-pressed', 'true', {
      timeout: DEFAULT_TIMEOUT,
    });
  }

  /**
   * Triggers an app reload, so caller must re-wait for QR after calling this.
   */
  async selectEnvironment(environmentId: E2eEnvironmentId) {
    const button = this.page.getByTestId(`${TEST_IDS.networkButton}-${environmentId}`);
    await expect(button).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await button.click();

    // Network change triggers a full reload — wait for the page to settle
    await this.page.waitForLoadState('domcontentloaded');
    await expect(this.page.locator('body')).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  }

  /**
   * Pair via the signing bot panel UI.
   * Sets the bot URL, waits for health check, and clicks Connect.
   */
  async connectViaBot(botUrl: string, username?: string) {
    // Wait for the signing bot panel to appear
    await expect(this.signingBotPanel).toBeVisible({ timeout: DEFAULT_TIMEOUT });

    // Fill in the bot URL (fill() clears existing value internally — no separate clear() needed)
    await this.signingBotUrlInput.fill(botUrl);

    // Wait for the bot health check to pass immediately after URL fill.
    // Doing this before other interactions avoids the green dot briefly disappearing
    // if something else triggers a re-render while we wait.
    await expect(this.signingBotReachable).toBeVisible({ timeout: DEFAULT_TIMEOUT });

    // Fill in the username if provided
    if (username) {
      await expect(this.signingBotUsernameInput).toBeVisible({ timeout: DEFAULT_TIMEOUT });
      await this.signingBotUsernameInput.click();
      await this.signingBotUsernameInput.fill(username);
    }

    // Click "Connect to Bot"
    await expect(this.signingBotConnectButton).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await this.signingBotConnectButton.locator('button').click();
  }
}
