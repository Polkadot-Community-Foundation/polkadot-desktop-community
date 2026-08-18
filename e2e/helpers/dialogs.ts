import { type Page } from '@playwright/test';

import { TEST_IDS } from '@/shared/test-ids';

const APPROVE_TESTIDS = [TEST_IDS.permissionDialogAllowAlways, TEST_IDS.aliasPermissionAllow];

/**
 * localStorage key whose value gates the auto-approver at runtime. Value `'0'`
 * disables it; any other value (or absence) keeps it enabled. Read live on
 * every candidate node, so the gate can be flipped per-test on a shared page
 * (worker-scoped authenticated session) without reinstalling the observer.
 *
 * `setDialogAutoApprove` runs after the per-test storage reset and before the
 * reload (`reset-state.ts`), so the observer — re-installed by `addInitScript`
 * on reload — reads the value the test set for it.
 */
const AUTO_APPROVE_FLAG_KEY = '__e2e_dialog_auto_approve';

/**
 * Auto-approve transient permission/alias dialogs in the renderer.
 *
 * Installs a MutationObserver via `addInitScript` (runs on every navigation)
 * and once immediately via `evaluate` (covers the already-loaded document).
 * Watches `document.body` for any element matching one of the approve
 * test-ids and clicks the inner `<button>` as soon as it appears. Fires
 * independently of Playwright actions — works even while the test is doing
 * non-interactive work like cycling through tabs.
 *
 * Whether a click actually fires is gated by the `AUTO_APPROVE_FLAG_KEY`
 * localStorage value, read live on every candidate node (default: enabled).
 * On a fresh-per-test app the observer is only installed when the test isn't
 * `@manual-permissions`, so the gate stays at its default. On the shared
 * worker-scoped authenticated page the observer is installed once and the
 * per-test soft-reset flips the gate via `setDialogAutoApprove` — installing
 * for normal tests, disabling for `@manual-permissions` — so state never
 * bleeds across tests on the shared page.
 *
 * "Always Allow" is preferred over "Allow Once" so the same product+permission
 * doesn't re-prompt within a test.
 *
 * The inner `<button>` is targeted (not the wrapper div the test-id sits on)
 * because the wrapper takes its width from the surrounding flex layout, so on
 * Windows its center can land in padding and a click misses the button.
 */
export async function registerProductDialogHandlers(page: Page) {
  const installAutoApprover = ({ testIds, flagKey }: { testIds: readonly string[]; flagKey: string }) => {
    const flag = '__e2eAutoApproveInstalled';
    if (Reflect.get(window, flag)) return;
    Reflect.set(window, flag, true);

    const selector = testIds.map(id => `[data-testid="${id}"]`).join(',');

    const enabled = () => {
      try {
        return localStorage.getItem(flagKey) !== '0';
      } catch {
        return true;
      }
    };

    const click = (node: Element) => {
      if (!enabled()) return;
      const button = node.matches('button') ? node : node.querySelector('button');
      if (button instanceof HTMLButtonElement) button.click();
    };

    const scan = (root: ParentNode) => {
      for (const node of root.querySelectorAll(selector)) click(node);
    };

    const start = () => {
      scan(document.body);
      new MutationObserver(records => {
        for (const record of records) {
          for (const added of record.addedNodes) {
            if (!(added instanceof Element)) continue;
            if (added.matches(selector)) click(added);
            scan(added);
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    };

    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
  };

  const arg = { testIds: APPROVE_TESTIDS, flagKey: AUTO_APPROVE_FLAG_KEY };
  await page.addInitScript(installAutoApprover, arg);
  await page.evaluate(installAutoApprover, arg).catch(() => {});
}

/**
 * Flip the auto-approver gate for the shared worker-scoped page. Writes the
 * `AUTO_APPROVE_FLAG_KEY` localStorage value the installed observer reads.
 * Call before the soft-reset reload so the value is in place when the
 * `addInitScript`-reinstalled observer comes up after the reload.
 */
export async function setDialogAutoApprove(page: Page, enabled: boolean): Promise<void> {
  await page
    .evaluate(
      ({ key, value }) => {
        try {
          localStorage.setItem(key, value);
        } catch {
          // opaque origin / storage unavailable — best-effort
        }
      },
      { key: AUTO_APPROVE_FLAG_KEY, value: enabled ? '1' : '0' },
    )
    .catch(() => {});
}
