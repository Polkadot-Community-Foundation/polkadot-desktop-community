import { type Page, expect } from '@playwright/test';

import { TEST_IDS } from '@/shared/test-ids';
import { DEFAULT_TIMEOUT } from '../helpers/timeouts';
import { waitForToastsToClear } from '../helpers/toasts';

/**
 * Page Object for the product actions menu (•••) and its items,
 * including "Enable offline access" and "Proceed in Chat".
 */
export class ProductActionsPage {
  constructor(private readonly page: Page) {}

  get menuTrigger() {
    return this.page.getByTestId(TEST_IDS.productActionsMenuTrigger);
  }

  /**
   * The "Proceed in Chat" menu item. It only renders for products whose worker
   * declares chat support, so it's matched by its accessible name (the shared
   * `productActionsMenuItem` testid can't disambiguate it from sibling items).
   */
  get proceedInChatMenuItem() {
    return this.page.getByRole('menuitem', { name: 'Proceed in Chat', exact: true });
  }

  get offlineAccessMenuItem() {
    return this.page.getByTestId(TEST_IDS.offlineAccessMenuItem);
  }

  get offlineAccessEnableConfirm() {
    return this.page.getByTestId(TEST_IDS.offlineAccessEnableConfirm);
  }

  get offlineAccessPinIndicator() {
    return this.page.getByTestId(TEST_IDS.offlineAccessPinIndicator);
  }

  get offlineAccessRemoveConfirm() {
    return this.page.getByTestId(TEST_IDS.offlineAccessRemoveConfirm);
  }

  get offlineAccessDialogCancel() {
    return this.page.getByTestId(TEST_IDS.offlineAccessDialogCancel);
  }

  get openSettingsMenuItem() {
    return this.page.getByTestId(TEST_IDS.productActionsMenuOpenSettings);
  }

  // The dashboard-shortcut item is a toggle whose label flips with state: a
  // widget-less product offers "Add to Favorites", which becomes "Remove from
  // Favorites" once pinned. Matched by accessible name (the shared
  // `productActionsMenuItem` testid can't disambiguate sibling items).
  get addToFavoritesMenuItem() {
    return this.page.getByRole('menuitem', { name: 'Add to Favorites', exact: true });
  }

  get removeFromFavoritesMenuItem() {
    return this.page.getByRole('menuitem', { name: 'Remove from Favorites', exact: true });
  }

  async clickAddToFavorites() {
    await expect(this.addToFavoritesMenuItem).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await this.addToFavoritesMenuItem.click();
  }

  async clickRemoveFromFavorites() {
    await expect(this.removeFromFavoritesMenuItem).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await this.removeFromFavoritesMenuItem.click();
  }

  async openProductSettings() {
    await expect(this.openSettingsMenuItem).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await this.openSettingsMenuItem.click();
  }

  async openMenu() {
    await expect(this.menuTrigger).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    // The trigger sits under the toast area, and every favorites / dashboard /
    // offline-access action this menu performs raises one — so re-opening the
    // menu right after would click the toast instead.
    await waitForToastsToClear(this.page);
    await this.menuTrigger.click();
  }

  async clickOfflineAccessMenuItem() {
    await expect(this.offlineAccessMenuItem).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await this.offlineAccessMenuItem.click();
  }

  async confirmEnableOfflineAccess() {
    await expect(this.offlineAccessEnableConfirm).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await this.offlineAccessEnableConfirm.click();
  }

  // When a product is already pinned, the same menu item is labelled "Remove
  // offline use" and opens the remove dialog instead.
  async confirmRemoveOfflineAccess() {
    await expect(this.offlineAccessRemoveConfirm).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await this.offlineAccessRemoveConfirm.click();
  }

  // Cancel the Enable-offline dialog via its secondary button. The dialog closes
  // without pinning the product.
  async cancelOfflineAccessDialog() {
    await expect(this.offlineAccessDialogCancel).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await this.offlineAccessDialogCancel.click();
  }

  // The Enable-offline dialog is dismissed once its confirm button is gone.
  async expectOfflineAccessDialogDismissed() {
    await expect(this.offlineAccessEnableConfirm).toBeHidden({ timeout: DEFAULT_TIMEOUT });
  }

  async expectPinIndicatorVisible() {
    await expect(this.offlineAccessPinIndicator).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  }

  async expectPinIndicatorHidden() {
    await expect(this.offlineAccessPinIndicator).toBeHidden({ timeout: DEFAULT_TIMEOUT });
  }

  /**
   * Open the ••• menu and pick "Proceed in Chat". The product's worker declares
   * its room straight into storage, so there is no confirmation step — the room
   * surfaces in the Quick Chat popover on its own once the worker has run.
   */
  async proceedInChat() {
    await this.openMenu();
    await expect(this.proceedInChatMenuItem).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await this.proceedInChatMenuItem.click();
  }
}
