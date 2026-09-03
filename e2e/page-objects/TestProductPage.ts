import { type ElectronApplication, type Page, expect } from '@playwright/test';

import { TEST_IDS } from '@/shared/test-ids';
import { DEFAULT_TIMEOUT, LONG_TIMEOUT, VERY_LONG_TIMEOUT } from '../helpers/timeouts';

/**
 * Page Object for the test-product-sdk test product page.
 * Handles navigation to the product and interaction with SDK test buttons.
 *
 * Product content renders inside an Electron <webview>, which Playwright
 * exposes as a separate Page (window). After navigation we must find that
 * webview page and interact with it directly.
 */
export class TestProductPage {
  private webviewPage: Page | null = null;
  private lastCategory: string | null = null;
  private lastAction: string | null = null;
  private lastProductName: string | null = null;

  constructor(
    private readonly page: Page,
    private readonly app: ElectronApplication,
  ) {}

  get addressBar() {
    return this.page.locator('[data-address-bar-input]');
  }

  /**
   * Find the webview page among existing windows.
   * The webview page is any window that is NOT the main app window.
   */
  private findWebviewPage(): Page | null {
    const windows = this.app.windows();
    return windows.find(w => w !== this.page && !w.isClosed()) ?? null;
  }

  /**
   * Navigate to a test product by entering its dotNS name in the address bar,
   * then wait for the webview page to appear.
   * If the webview is already open, reuses it.
   */
  async navigateTo(productName: string) {
    this.lastProductName = productName;
    // Check if webview already exists (e.g. from a previous test in Background)
    const existingWebview = this.findWebviewPage();
    if (existingWebview) {
      this.webviewPage = existingWebview;
      return;
    }

    const windowPromise = this.app.waitForEvent('window', { timeout: LONG_TIMEOUT });

    await this.addressBar.click();
    await this.addressBar.fill(productName);
    await this.addressBar.press('Enter');

    // The webview spawns a new window — wait for it
    this.webviewPage = await windowPromise;
    await this.webviewPage.waitForLoadState('domcontentloaded');
  }

  /**
   * Get the webview page (product content). Throws if navigateTo was not called.
   */
  private getWebview(): Page {
    if (!this.webviewPage) {
      throw new Error('Webview page not found. Call navigateTo() first.');
    }
    return this.webviewPage;
  }

  /**
   * Wait for the product UI to fully load.
   * Works in both wide (sidebar with CATEGORIES) and narrow (inline sections) layouts.
   *
   * Uses domcontentloaded + a heading visibility check rather than networkidle:
   * the product keeps long-poll/WebSocket connections open, so networkidle never
   * settles reliably and was flaky in CI.
   */
  async waitForProductReady() {
    const tryLoad = async () => {
      const webview = this.getWebview();
      await webview.waitForLoadState('domcontentloaded', { timeout: LONG_TIMEOUT });
      // Wait for the heading — present in both layouts
      await expect(webview.getByRole('heading', { name: 'Accounts' }).first()).toBeVisible({ timeout: LONG_TIMEOUT });
    };
    try {
      await tryLoad();
    } catch (err) {
      // Webview may have closed immediately (transient DotNS/IPFS failure).
      // Re-navigate once if we know the product name.
      if (!this.lastProductName) throw err;
      this.webviewPage = null;
      await this.navigateTo(this.lastProductName);
      await tryLoad();
    }
  }

  /**
   * Click a category tab (e.g. "Accounts", "Signing", etc.)
   * In wide layout: clicks a sidebar button in the CATEGORIES section.
   * In narrow layout: scrolls to the category heading (sections are already visible).
   */
  async clickCategory(categoryName: string) {
    this.lastCategory = categoryName;
    const webview = this.getWebview();
    const categoriesHeader = webview.getByText('CATEGORIES').first();

    if (await categoriesHeader.isVisible({ timeout: 2_000 }).catch(() => false)) {
      // Wide layout — sidebar with category buttons
      const categoriesSection = categoriesHeader.locator('..');
      await categoriesSection.getByRole('button', { name: categoryName }).click();
    } else {
      // Narrow layout — scroll to the category heading
      const heading = webview.getByRole('heading', { name: categoryName }).first();
      await heading.scrollIntoViewIfNeeded();
    }
  }

  /**
   * Run a test action by clicking its button (partial name match).
   */
  async runAction(actionName: string) {
    this.lastAction = actionName;
    const webview = this.getWebview();

    // Reset logs before running so previous results don't interfere with assertions
    await webview.getByRole('button', { name: 'Reset' }).click();

    // Action buttons contain a title + description. Filter to the button
    // that has an element with the exact action name text inside it.
    await webview
      .getByRole('button')
      .filter({ has: webview.getByText(actionName, { exact: true }) })
      .click();
  }

  /**
   * Reload the product by triggering the browser refresh action in the host app.
   *
   * Refresh remounts the React subtree (key change in `Browser.tsx`), so the
   * old `<webview>` is destroyed and a new guest BrowserView spawns.
   *
   * Three subtle hazards we have to defend against:
   *
   *  1. AddressBarRefreshButton becomes `pointer-events:none opacity-0` when
   *     the address bar is focused. Playwright's `.click()` then fails the
   *     actionability check (or, with `force: true`, the click target is the
   *     element underneath because of CSS hit-testing). We bypass the issue
   *     by dispatching a synthetic `click` directly via `dispatchEvent` —
   *     React's onClick handler fires regardless of CSS hit-testing. (The
   *     button's onMouseDown only calls preventDefault; the actual refresh
   *     handler is on onClick since dea62faf.)
   *  2. The new <webview> only mounts after `useDomainResolver` +
   *     `useIpfsProductArchive` both settle, each capped at 60s in
   *     `f6a28ca5`. Worst case can exceed LONG_TIMEOUT; bound by
   *     `VERY_LONG_TIMEOUT` (120s).
   *  3. Race between Playwright subscribing to the 'window' event and React
   *     spawning the new <webview>. Subscribe BEFORE dispatching to make the
   *     event-loss window zero, then fall back to polling app.windows() in
   *     case Playwright registered the Page synchronously between dispatch
   *     and subscribe.
   */
  async reloadProduct() {
    const oldWebview = this.webviewPage;
    const isCandidate = (w: Page) => w !== this.page && w !== oldWebview && !w.isClosed();

    const refreshButton = this.page.getByTestId(TEST_IDS.browserRefreshButton);
    await expect(refreshButton).toBeAttached({ timeout: DEFAULT_TIMEOUT });

    const newWindowPromise = this.app.waitForEvent('window', {
      predicate: isCandidate,
      timeout: VERY_LONG_TIMEOUT,
    });

    // dispatchEvent ignores CSS pointer-events and Playwright actionability,
    // and AddressBarRefreshButton's React `onClick` listener fires regardless
    // of where focus is.
    await refreshButton.dispatchEvent('click');

    const captured = await Promise.race([newWindowPromise, this.pollForCandidateWindow(isCandidate, VERY_LONG_TIMEOUT)]);

    this.webviewPage = captured;
    await captured.waitForLoadState('domcontentloaded', { timeout: LONG_TIMEOUT });
    await this.waitForProductReady();
  }

  private async pollForCandidateWindow(predicate: (w: Page) => boolean, timeoutMs: number): Promise<Page> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const next = this.app.windows().find(predicate);
      if (next) return next;
      await new Promise(r => setTimeout(r, 200));
    }
    throw new Error(`pollForCandidateWindow: no matching window within ${timeoutMs}ms`);
  }

  /**
   * Confirm a signing request in the host app modal.
   * The "Sign" button appears in a modal dialog on the main page (not the webview).
   *
   * The product may request resource allocation (e.g. AutoSigning) before signing.
   * When it does, the allocation modal appears first and blocks the signing queue —
   * so the signing "Continue" button never shows until the allocation is approved. This method
   * first checks for and clicks "Continue" in the allowance modal if that modal is present.
   *
   * After clicking "Continue" in the signing modal, waits briefly for a possible submit error
   * alert (e.g. NoAllowanceError when the account allowance isn't set up yet).
   * If the error appears AND the signing modal is still open (error is from signing,
   * not a background operation), cancels the modal, reloads the product, re-runs the
   * last category/action, and retries up to {@link MAX_SIGNING_RETRIES} times.
   */
  /**
   * The product may request AutoSigning (or other) resource allocation before signing,
   * which queues in pappSsoQueue ahead of the sign request. Approve it so the queue
   * unblocks and the signing modal can appear. No-op when no allocation dialog shows.
   */
  private async approveAllocationIfPresent() {
    const allocationContinueButton = this.page
      .getByRole('dialog', { name: 'Allowance request' })
      .getByRole('button', { name: 'Continue', exact: true });
    const needsAllocation = await allocationContinueButton
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (needsAllocation) {
      await allocationContinueButton.click();
      // Wait for the allocation dialog to fully close (bot approves on-chain)
      const allocationDialog = this.page.getByRole('dialog', { name: 'Allowance request' });
      await expect(allocationDialog).toBeHidden({ timeout: LONG_TIMEOUT });
    }
  }

  async confirmSigning() {
    const SUBMIT_ERROR_WATCH_MS = 15_000;
    const RETRY_DELAY_MS = 30_000;
    const MAX_SIGNING_RETRIES = 2;

    await this.approveAllocationIfPresent();

    for (let attempt = 0; ; attempt++) {
      const signButton = this.page.getByRole('button', { name: 'Continue', exact: true });
      await expect(signButton).toBeVisible({ timeout: DEFAULT_TIMEOUT });
      await signButton.click();

      // waitFor actually waits for the element to appear, unlike isVisible which checks instantly
      const errorAlert = this.page.getByTestId(TEST_IDS.submitErrorAlert);
      const hasError = await errorAlert
        .waitFor({ state: 'visible', timeout: SUBMIT_ERROR_WATCH_MS })
        .then(() => true)
        .catch(() => false);

      if (!hasError) {
        return;
      }

      // If the signing modal is already closed, the error was from a background
      // operation (e.g. statement-store), not from signing itself — the signing
      // succeeded, so skip the retry.
      const cancelButton = this.page.getByRole('button', { name: 'Cancel', exact: true });
      const isModalStillOpen = await cancelButton.isVisible().catch(() => false);
      if (!isModalStillOpen) {
        return;
      }

      if (attempt >= MAX_SIGNING_RETRIES) {
        throw new Error(`Signing failed with submit error after ${MAX_SIGNING_RETRIES + 1} attempts`);
      }

      console.warn(
        `[confirmSigning] Submit error detected (attempt ${attempt + 1}), waiting ${RETRY_DELAY_MS / 1000}s before retry...`,
      );

      // Close the signing modal
      await cancelButton.click();

      // Wait for allowance to propagate before retrying
      await this.page.waitForTimeout(RETRY_DELAY_MS);

      // Reload and replay the last category + action
      await this.reloadProduct();
      if (this.lastCategory) {
        await this.clickCategory(this.lastCategory);
      }
      if (this.lastAction) {
        await this.runAction(this.lastAction);
      }
    }
  }

  /**
   * Reject a pending signing request by cancelling the host signing modal. The
   * product's signing promise then rejects and the result surfaces the rejection.
   */
  async rejectSigning() {
    const cancelButton = this.page.getByRole('button', { name: 'Cancel', exact: true });
    await expect(cancelButton).toBeVisible({ timeout: LONG_TIMEOUT });
    await cancelButton.click();
  }

  // --- Sign Payload / Create Transaction review screen ----------------------
  // Shared review UI rendered by SignPayloadModal and CreateTransactionModal.
  // A transaction-producing host action (e.g. "Create Transaction with Product
  // Account", "Sign & Submit Batch") opens this screen before signing.

  get signReviewContinueButton() {
    return this.page.getByTestId(TEST_IDS.signReviewContinueButton);
  }

  get signReviewMoreDetailsButton() {
    return this.page.getByTestId(TEST_IDS.signReviewMoreDetails);
  }

  /**
   * Wait for the signing review screen to render. Approves a preceding resource
   * allocation dialog if the product requests one, then waits for the review's
   * "Continue to Sign" footer button — gated by chain connection + fee load, so
   * VERY_LONG_TIMEOUT.
   */
  async waitForSignReviewScreen() {
    await this.approveAllocationIfPresent();
    await expect(this.signReviewContinueButton).toBeVisible({ timeout: VERY_LONG_TIMEOUT });
  }

  /** Assert the review summary shows account, network, fee and call title. */
  async expectReviewSummaryFields() {
    await expect(this.page.getByTestId(TEST_IDS.signReviewCallTitle)).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await expect(this.page.getByTestId(TEST_IDS.signReviewAccount)).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await expect(this.page.getByTestId(TEST_IDS.signReviewNetwork)).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    // Fee row only renders for an inspectable chain; wait long enough for fee estimation.
    await expect(this.page.getByTestId(TEST_IDS.signReviewFee)).toBeVisible({ timeout: VERY_LONG_TIMEOUT });
  }

  /** Click "More details" and assert the arguments + call-data sections expand. */
  async expandReviewDetails() {
    await expect(this.signReviewMoreDetailsButton).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await this.signReviewMoreDetailsButton.click();
    await expect(this.page.getByTestId(TEST_IDS.signReviewArguments)).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await expect(this.page.getByTestId(TEST_IDS.signReviewCallData)).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  }

  /** Assert the utility.batch* behaviour hint is shown on the review summary. */
  async expectBatchBehaviorHint() {
    await expect(this.page.getByTestId(TEST_IDS.signReviewBatchHint)).toBeVisible({ timeout: VERY_LONG_TIMEOUT });
  }

  /** Dismiss the review screen via its Cancel button (rejects the signing flow). */
  async cancelSignReview() {
    const cancelButton = this.page.getByRole('button', { name: 'Cancel', exact: true });
    await expect(cancelButton).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await cancelButton.click();
  }

  /**
   * Double-click "Continue to Sign" to exercise the re-entrancy guard
   * (signStartedRef): the second click must not start a second signing. The
   * review button leaves the DOM after the first click (the modal advances to
   * the signing step), so the double-click lands as two rapid events on the
   * same node before re-render.
   */
  async doubleClickContinueToSign() {
    await expect(this.signReviewContinueButton).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await this.signReviewContinueButton.dblclick();
  }

  /**
   * Approve a host permission request with "Allow Always". The testid sits on a
   * wrapper div, so the inner <button> is clicked (see e2e/helpers/dialogs.ts).
   * Requires the feature to be tagged @manual-permissions (otherwise the
   * auto-approver dismisses the dialog first).
   */
  async allowPermissionAlways() {
    // The testid sits on two nodes (a label div + the button wrapper); target the
    // one that actually contains a <button>.
    const button = this.page.getByTestId(TEST_IDS.permissionDialogAllowAlways).locator('button').first();
    await expect(button).toBeVisible({ timeout: LONG_TIMEOUT });
    // force: the dialog animates in and can briefly fail the stability check.
    await button.click({ force: true });
  }

  /** Assert a host device-permission request dialog is rendered (its Allow Always button is visible). */
  async expectDevicePermissionDialog() {
    const button = this.page.getByTestId(TEST_IDS.permissionDialogAllowAlways).locator('button').first();
    await expect(button).toBeVisible({ timeout: LONG_TIMEOUT });
  }

  /** Approve a host permission request with "Allow Once". */
  async allowPermissionOnce() {
    await this.clickPermissionButton('Allow Once');
  }

  /** Reject a host permission request with "Don't Allow". */
  async denyPermission() {
    await this.clickPermissionButton("Don't Allow");
  }

  /** Dismiss a host permission request without choosing (Escape → defaults to denied). */
  async dismissPermission() {
    const allow = this.page.getByTestId(TEST_IDS.permissionDialogAllowAlways).locator('button').first();
    await expect(allow).toBeVisible({ timeout: LONG_TIMEOUT });
    await this.page.keyboard.press('Escape');
  }

  private async clickPermissionButton(name: string) {
    const button = this.page.getByRole('button', { name, exact: true });
    await expect(button).toBeVisible({ timeout: LONG_TIMEOUT });
    await button.click({ force: true });
  }

  // --- Alias permission dialog (getAlias) -----------------------------------

  /**
   * Assert the alias-permission request dialog is rendered. The testid sits on a
   * `display:contents` marker (no box of its own), so attachment is checked; the
   * "Always Allow" button visibility confirms the dialog actually painted.
   */
  async expectAliasPermissionDialog() {
    await expect(this.page.getByTestId(TEST_IDS.aliasPermissionDialog)).toBeAttached({ timeout: LONG_TIMEOUT });
    // The alias dialog puts the testid directly on the <button> (tr-ui Button
    // forwards data-testid), unlike the device dialog's wrapper div.
    await expect(this.page.getByTestId(TEST_IDS.aliasPermissionAllow)).toBeVisible({ timeout: LONG_TIMEOUT });
  }

  /** Approve an alias request with "Always Allow" (persists a granted alias context). */
  async allowAliasAlways() {
    const button = this.page.getByTestId(TEST_IDS.aliasPermissionAllow);
    await expect(button).toBeVisible({ timeout: LONG_TIMEOUT });
    await button.click({ force: true });
  }

  /** Approve an alias request with "Allow Once" (does not persist). */
  async allowAliasOnce() {
    await this.clickPermissionButton('Allow Once');
  }

  /** Reject an alias request with "Don't Allow". */
  async denyAlias() {
    await this.clickPermissionButton("Don't Allow");
  }

  /** Assert the alias-permission dialog has closed (decision accepted). */
  async expectAliasPermissionDialogClosed() {
    await expect(this.page.getByTestId(TEST_IDS.aliasPermissionDialog)).toBeHidden({ timeout: LONG_TIMEOUT });
  }

  // --- Allowance / resource allocation request dialog -----------------------

  /**
   * Assert the resource-allocation ("Allowance request") modal is rendered. This
   * dialog is NOT auto-approved by `e2e/helpers/dialogs.ts`, so it always shows
   * when a product requests a resource allocation, regardless of the
   * @manual-permissions tag.
   */
  async expectAllocationRequestDialog() {
    await expect(this.page.getByTestId(TEST_IDS.allocationRequestDialog)).toBeAttached({ timeout: VERY_LONG_TIMEOUT });
  }

  // --- Notifications (Host API) ---------------------------------------------
  // host-playground.dot ships its own testids on the Notification card controls:
  //   run-push-notification, arg-push-notification-scheduleInSeconds.
  // These belong to the deployed product, not the host app, so they are not in
  // src/shared/test-ids.ts (same convention as matching its action buttons by
  // text elsewhere in this PO).

  private get runPushNotificationButton() {
    return this.getWebview().getByTestId('run-push-notification');
  }

  private get scheduleInSecondsInput() {
    return this.getWebview().getByTestId('arg-push-notification-scheduleInSeconds');
  }

  /**
   * Fire a synchronous burst of immediate push notifications by clicking the
   * product's Push button {@link count} times in a single JS turn. Every push
   * first issues a (rate-limited) Notifications device-permission request, so a
   * burst trips the host's per-product rate limiter and surfaces a rate-limit
   * toast in the host window. Synchronous clicks guarantee we exceed the
   * 20-requests/second drop threshold regardless of CI click latency.
   */
  async fireBurstOfPushNotifications(count = 25) {
    await expect(this.runPushNotificationButton).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await this.runPushNotificationButton.evaluate((btn, n) => {
      if (!(btn instanceof HTMLElement)) return;
      for (let i = 0; i < n; i++) btn.click();
    }, count);
  }

  /**
   * Assert the host rendered a rate-limit toast naming the product and a limiter
   * type. The toast is a tr-ui/sonner toast (no forwardable testid), so it is
   * matched by sonner's stable `[data-sonner-toast]` attribute plus its visible
   * text: the title is the product name and the description is
   * "<limiterType> limit is reached".
   */
  async expectRateLimitToastNamesProduct(productName: string) {
    const toast = this.page.locator('[data-sonner-toast]', { hasText: 'limit is reached' });
    await expect(toast).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await expect(toast).toContainText(productName, { timeout: DEFAULT_TIMEOUT });
  }

  /**
   * Fill the queue of FUTURE-scheduled notifications past the host cap so the
   * next schedule returns ScheduleLimitReached. Uses a far future offset so the
   * schedules stay pending in the host queue (counting toward the cap) instead
   * of firing, and keeps scheduling until the limit surfaces.
   *
   * The product disables the push button while each schedule round-trips to the
   * host and re-renders its log afterwards, so schedules only land at ~5/second.
   * Earlier fire-and-forget / in-page click strategies either lost the
   * actionability race against the re-render or no-op'd against the disabled
   * button, landing an unpredictable fraction (0–31) and never reaching the cap.
   * A *blocking* Playwright `.click()` instead waits for the button to be
   * actionable (enabled + stable) before each click, so every click lands and
   * the loop paces itself to the button's real availability. We stop as soon as
   * the limit surfaces rather than guessing a fixed over-shoot count; the small
   * pacing floor keeps us under the host's 20-per-1000ms rate-limit drop
   * threshold if the button ever stops gating.
   */
  async scheduleNotificationsPastLimit() {
    const FUTURE_OFFSET_SECONDS = '3600';
    const MAX_ATTEMPTS = 120; // > HOST_QUEUE_CAPACITY (64); a landed click per iteration overshoots
    const PACING_FLOOR_MS = 60; // ≤ ~16/s, under the 20/1000ms rate-limit drop threshold
    const WARMUP_SETTLE_MS = 3_000;
    const webview = this.getWebview();

    // Warm-up: one immediate push grants the Notifications device permission
    // (auto-approved) so the future schedules below don't race a dialog and
    // waste cap slots on permission-denied failures.
    await expect(this.runPushNotificationButton).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await this.runPushNotificationButton.click({ timeout: DEFAULT_TIMEOUT });
    await webview.waitForTimeout(WARMUP_SETTLE_MS);

    // Far-future offset keeps each schedule pending in the host queue (counts
    // toward the cap) instead of firing immediately (which bypasses the cap).
    await this.scheduleInSecondsInput.fill(FUTURE_OFFSET_SECONDS);

    // Once the cap is exceeded the product logs the host's ScheduleLimitReached
    // rejection as a RangeError (product-sdk 0.19.1) — that is the signal the
    // over-shoot has surfaced, so stop as soon as it appears. Kept in sync with
    // the assertion in host-api.feature (TC-11.1.5).
    const limitReached = webview.getByText('RangeError').first();
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      // Blocking click — waits for the button to be actionable, so it lands even
      // while the product gates/re-renders it between schedules.
      await this.runPushNotificationButton.click({ timeout: DEFAULT_TIMEOUT });
      if (await limitReached.isVisible().catch(() => false)) break;
      await webview.waitForTimeout(PACING_FLOOR_MS);
    }
  }

  /**
   * Assert that the webview page contains expected result text.
   * On failure, returns a diagnostics payload (visible body text + HTML snippet)
   * so the caller can attach it to the test report.
   */
  async expectResultContains(text: string) {
    const webview = this.getWebview();
    try {
      await expect(webview.getByText(text).first()).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    } catch (err) {
      const diagnostics = await this.collectWebviewDiagnostics();

      console.error(
        `[expectResultContains] failed — looking for "${text}"\nwebview url: ${diagnostics.url}\nwebview body text:\n${diagnostics.bodyText}`,
      );
      throw err;
    }
  }

  /**
   * Capture the current webview body text and a screenshot for diagnostics.
   */
  async collectWebviewDiagnostics(): Promise<{ bodyText: string; screenshot: Buffer | null; url: string }> {
    const webview = this.getWebview();
    let bodyText: string;
    let screenshot: Buffer | null;
    let url: string;
    try {
      url = webview.url();
    } catch {
      url = '<failed to read webview url>';
    }
    try {
      bodyText = await webview.locator('body').innerText({ timeout: 2_000 });
    } catch {
      bodyText = '<failed to read webview body>';
    }
    try {
      screenshot = await webview.screenshot({ fullPage: true });
    } catch {
      screenshot = null;
    }
    return { bodyText, screenshot, url };
  }
}
